import { CollateralizationOracle } from '@custom-types/contracts';
import { NamedAddresses, NamedContracts } from '@custom-types/types';
import { ProposalsConfig } from '@protocol/proposalsConfig';
import {
  expectApprox,
  getImpersonatedSigner,
  increaseTime,
  latestTime,
  overwriteChainlinkAggregator
} from '@test/helpers';
import { TestEndtoEndCoordinator } from '@test/integration/setup';
import chai, { expect } from 'chai';
import CBN from 'chai-bn';
import { solidity } from 'ethereum-waffle';
import { ethers } from 'hardhat';

const toBN = ethers.BigNumber.from;

describe('e2e-buybacks', function () {
  let contracts: NamedContracts;
  let contractAddresses: NamedAddresses;
  let deployAddress: string;
  let e2eCoord: TestEndtoEndCoordinator;
  let doLogging: boolean;

  before(async () => {
    chai.use(CBN(ethers.BigNumber));
    chai.use(solidity);
  });

  before(async function () {
    // Setup test environment and get contracts
    const version = 1;
    deployAddress = (await ethers.getSigners())[0].address;
    if (!deployAddress) throw new Error(`No deploy address!`);

    doLogging = Boolean(process.env.LOGGING);

    const config = {
      logging: doLogging,
      deployAddress: deployAddress,
      version: version
    };

    e2eCoord = new TestEndtoEndCoordinator(config, ProposalsConfig);

    doLogging && console.log(`Loading environment...`);
    ({ contracts, contractAddresses } = await e2eCoord.loadEnvironment());
    doLogging && console.log(`Environment loaded.`);

    // unpause the pcv equity minter if it is paused
    if (await contracts.pcvEquityMinter.paused()) {
      const govSigner = await getImpersonatedSigner(contracts.feiDAOTimelock.address);
      await contracts.pcvEquityMinter.connect(govSigner).unpause();
    }
  });

  describe('PCV Equity Minter + LBP', async function () {
    it('mints appropriate amount and swaps', async function () {
      const {
        pcvEquityMinter,
        collateralizationOracle,
        namedStaticPCVDepositWrapper,
        noFeeFeiTribeLBPSwapper,
        fei,
        tribe,
        core
      } = contracts;

      await increaseTime(await noFeeFeiTribeLBPSwapper.remainingTime());

      const pcvStats = await collateralizationOracle.pcvStats();

      if (pcvStats[2] < 0) {
        await namedStaticPCVDepositWrapper.addDeposit({
          depositName: 'deposit',
          usdAmount: pcvStats[0],
          feiAmount: '0',
          underlyingTokenAmount: 1,
          underlyingToken: tribe.address
        });
      }

      // set Chainlink ETHUSD to a fixed 4,000$ value
      await overwriteChainlinkAggregator(contractAddresses.chainlinkEthUsdOracle, '400000000000', '8');

      // set Chainlink OHM_V2:USD to a fixed ~$14.5 value
      // Need to override the chainlink storage to make it a fresh value because otherwise
      // fork block is well out of date, oracle will report invalid and the CR will be invalid
      await overwriteChainlinkAggregator(contractAddresses.chainlinkOHMV2EthOracle, '8748580000000000', '18');

      await collateralizationOracle.update();

      await core.allocateTribe(noFeeFeiTribeLBPSwapper.address, ethers.constants.WeiPerEther.mul(1_000_000));
      const tx = await pcvEquityMinter.mint();
      expect(tx).to.emit(pcvEquityMinter, 'FeiMinting');
      expect(tx).to.emit(fei, 'Transfer');
      expect(tx).to.emit(tribe, 'Transfer');

      expect(await noFeeFeiTribeLBPSwapper.swapEndTime()).to.be.gt(toBN((await latestTime()).toString()));

      await increaseTime(await pcvEquityMinter.duration());
      await core.allocateTribe(noFeeFeiTribeLBPSwapper.address, ethers.constants.WeiPerEther.mul(1_000_000));

      await pcvEquityMinter.mint();
    });
  });

  describe('Collateralization Oracle', async function () {
    before(async function () {
      const numDeposits = await contracts.namedStaticPCVDepositWrapper.numDeposits();
      if (numDeposits == 0) {
        await contracts.namedStaticPCVDepositWrapper.addDeposit({
          depositName: 'make static pcv deposit not empty',
          usdAmount: 1,
          feiAmount: 1,
          underlyingTokenAmount: 1,
          underlyingToken: ethers.constants.AddressZero
        });
      }
    });

    it('exempting an address removes from PCV stats', async function () {
      const collateralizationOracle: CollateralizationOracle =
        contracts.collateralizationOracle as CollateralizationOracle;
      const namedStaticPCVDepositWrapper = contracts.namedStaticPCVDepositWrapper;

      const beforeBalance = (await namedStaticPCVDepositWrapper.pcvDeposits(0)).usdAmount;

      const beforeStats = await collateralizationOracle.pcvStats();
      await namedStaticPCVDepositWrapper.removeDeposit(0);
      const afterStats = await collateralizationOracle.pcvStats();

      expectApprox(afterStats[0], beforeStats[0].sub(beforeBalance));
      expectApprox(afterStats[1], afterStats[1]);
      expectApprox(afterStats[2], beforeStats[2].sub(beforeBalance));
    });
  });
});
