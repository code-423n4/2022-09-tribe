import chai, { expect } from 'chai';
import CBN from 'chai-bn';
import { solidity } from 'ethereum-waffle';
import { ethers } from 'hardhat';
import { NamedContracts } from '@custom-types/types';
import { expectRevert, getAddresses, getImpersonatedSigner, time } from '@test/helpers';
import { TestEndtoEndCoordinator } from '@test/integration/setup';
import { ProposalsConfig } from '@protocol/proposalsConfig';
import { forceEth } from '@test/integration/setup/utils';
import { Contract, Signer } from 'ethers';
import { expectApprox } from '@test/helpers';

describe('e2e-peg-stability-module', function () {
  const impersonatedSigners: { [key: string]: Signer } = {};
  let contracts: NamedContracts;
  let deployAddress: string;
  let e2eCoord: TestEndtoEndCoordinator;
  let daiPCVDripController: Contract;
  let doLogging: boolean;
  let userAddress: string;
  let minterAddress: string;
  let dai: Contract;
  let fei: Contract;
  let core: Contract;
  let feiDAOTimelock: Contract;
  let daiFixedPricePSM: Contract;

  before(async () => {
    chai.use(CBN(ethers.BigNumber));
    chai.use(solidity);
  });

  before(async function () {
    // Setup test environment and get contracts
    const version = 1;
    deployAddress = (await ethers.getSigners())[0].address;
    if (!deployAddress) throw new Error(`No deploy address!`);
    const addresses = await getAddresses();

    doLogging = Boolean(process.env.LOGGING);

    const config = {
      logging: doLogging,
      deployAddress: deployAddress,
      version: version
    };

    e2eCoord = new TestEndtoEndCoordinator(config, ProposalsConfig);

    doLogging && console.log(`Loading environment...`);
    ({ contracts } = await e2eCoord.loadEnvironment());
    ({ dai, daiFixedPricePSM, fei, core, daiPCVDripController, feiDAOTimelock } = contracts);
    doLogging && console.log(`Environment loaded.`);

    // add any addresses you want to impersonate here
    const impersonatedAddresses = [
      addresses.userAddress,
      addresses.pcvControllerAddress,
      addresses.governorAddress,
      addresses.minterAddress,
      addresses.burnerAddress,
      addresses.beneficiaryAddress1,
      addresses.beneficiaryAddress2,
      addresses.guardianAddress,
      contracts.feiDAOTimelock.address
    ];

    ({ userAddress, minterAddress } = addresses);

    await core.grantMinter(minterAddress);

    for (const address of impersonatedAddresses) {
      impersonatedSigners[address] = await getImpersonatedSigner(address);
    }
  });

  before(async function () {
    const aaveEthPCVDepositPaused = await contracts.aaveEthPCVDeposit.paused();
    if (aaveEthPCVDepositPaused) {
      await contracts.aaveEthPCVDeposit.unpause();
    }
  });

  describe('dai-psm pcv drip controller', async () => {
    before(async function () {
      // make sure there is enough DAI available to the dripper and on the PSM
      const DAI_HOLDER = '0xbebc44782c7db0a1a60cb6fe97d0b483032ff1c7'; // curve 3pool
      const signer = await getImpersonatedSigner(DAI_HOLDER);
      await forceEth(DAI_HOLDER);
      await contracts.dai.connect(signer).transfer(
        contracts.compoundDaiPCVDeposit.address,
        '100000000000000000000000000' // 100M
      );
      await contracts.compoundDaiPCVDeposit.deposit();
      await contracts.dai.connect(signer).transfer(
        daiFixedPricePSM.address,
        '5500000000000000000000000' // 5.5M
      );
    });

    beforeEach(async () => {
      await time.increase('2000');
    });

    it('does not drip when the dai PSM is above the threshold', async () => {
      expect(await daiPCVDripController.isTimeEnded()).to.be.true;
      expect(await daiPCVDripController.dripEligible()).to.be.false;
      await expectRevert(daiPCVDripController.drip(), 'PCVDripController: not eligible');
    });

    it('does drip when the dai PSM is under the threshold', async () => {
      const timelock = await getImpersonatedSigner(feiDAOTimelock.address);
      await daiFixedPricePSM
        .connect(timelock)
        .withdrawERC20(
          dai.address,
          contracts.compoundDaiPCVDeposit.address,
          await dai.balanceOf(daiFixedPricePSM.address)
        );
      await contracts.compoundDaiPCVDeposit.deposit();

      expect(await dai.balanceOf(daiFixedPricePSM.address)).to.be.equal(0);

      await daiPCVDripController.drip();

      expect(await dai.balanceOf(daiFixedPricePSM.address)).to.be.equal(await daiPCVDripController.dripAmount());
    });
  });

  describe('dai_psm', async () => {
    describe('redeem', function () {
      const redeemAmount = 500_000;
      beforeEach(async () => {
        await fei.connect(impersonatedSigners[minterAddress]).mint(userAddress, redeemAmount);
        await fei.connect(impersonatedSigners[userAddress]).approve(daiFixedPricePSM.address, redeemAmount);

        const isPaused = await daiFixedPricePSM.paused();
        if (isPaused) {
          await daiFixedPricePSM.unpause();
        }

        const isRedeemPaused = await daiFixedPricePSM.redeemPaused();
        if (isRedeemPaused) {
          await daiFixedPricePSM.unpauseRedeem();
        }
      });

      it('exchanges 500,000 FEI for DAI', async () => {
        const startingFEIBalance = await fei.balanceOf(userAddress);
        const startingDAIBalance = await dai.balanceOf(userAddress);
        const expectedDAIAmount = await daiFixedPricePSM.getRedeemAmountOut(redeemAmount);

        await daiFixedPricePSM
          .connect(impersonatedSigners[userAddress])
          .redeem(userAddress, redeemAmount, expectedDAIAmount);

        const endingFEIBalance = await fei.balanceOf(userAddress);
        const endingDAIBalance = await dai.balanceOf(userAddress);

        expect(endingDAIBalance.sub(startingDAIBalance)).to.be.equal(expectedDAIAmount);
        expect(startingFEIBalance.sub(endingFEIBalance)).to.be.equal(redeemAmount);
        expect(expectedDAIAmount).to.be.gt(0);
      });

      it('DAI price sanity check', async () => {
        const actualDAIAmountOut = await daiFixedPricePSM.getRedeemAmountOut(redeemAmount);
        await expectApprox(actualDAIAmountOut, redeemAmount);
      });
    });

    describe('mint', function () {
      const mintAmount = 500_000;

      beforeEach(async () => {
        const daiAccount = '0xbb2e5c2ff298fd96e166f90c8abacaf714df14f8';
        const daiSigner = await getImpersonatedSigner(daiAccount);
        await forceEth(daiAccount);
        await dai.connect(daiSigner).transfer(userAddress, mintAmount);
        await dai.connect(impersonatedSigners[userAddress]).approve(daiFixedPricePSM.address, mintAmount);
      });

      it('mint succeeds with 500_000 DAI', async () => {
        const minAmountOut = await daiFixedPricePSM.getMintAmountOut(mintAmount / 2);
        const userStartingFEIBalance = await fei.balanceOf(userAddress);
        const psmStartingDAIBalance = await dai.balanceOf(daiFixedPricePSM.address);

        await daiFixedPricePSM
          .connect(impersonatedSigners[userAddress])
          .mint(userAddress, mintAmount / 2, minAmountOut);

        const psmEndingDAIBalance = await dai.balanceOf(daiFixedPricePSM.address);
        const userEndingFEIBalance = await fei.balanceOf(userAddress);

        expect(userEndingFEIBalance.sub(userStartingFEIBalance)).to.be.gte(minAmountOut);
        expect(psmEndingDAIBalance.sub(psmStartingDAIBalance)).to.be.equal(mintAmount / 2);
      });

      it('DAI price sanity check', async () => {
        const actualDAIAmountOut = await daiFixedPricePSM.getMintAmountOut(mintAmount);
        await expectApprox(actualDAIAmountOut, mintAmount);
      });
    });
  });
});
