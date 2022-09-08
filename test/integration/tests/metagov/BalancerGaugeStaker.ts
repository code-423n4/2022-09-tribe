import chai, { expect } from 'chai';
import CBN from 'chai-bn';
import { solidity } from 'ethereum-waffle';
import { ethers } from 'hardhat';
import { NamedContracts } from '@custom-types/types';
import { ProposalsConfig } from '@protocol/proposalsConfig';
import { TestEndtoEndCoordinator } from '@test/integration/setup';
import { getImpersonatedSigner, expectRevert, expectEvent } from '@test/helpers';
import { forceEth } from '@test/integration/setup/utils';
import { BalancerGaugeStaker } from '@custom-types/contracts';

const e18 = '000000000000000000';

describe('e2e-metagov', function () {
  let deployAddress: string;
  let contracts: NamedContracts;
  let e2eCoord: TestEndtoEndCoordinator;
  const logging = Boolean(process.env.LOGGING);

  before(async () => {
    chai.use(CBN(ethers.BigNumber));
    chai.use(solidity);
  });

  before(async function () {
    deployAddress = (await ethers.getSigners())[0].address;
    const config = {
      logging,
      deployAddress,
      version: 1
    };
    e2eCoord = new TestEndtoEndCoordinator(config, ProposalsConfig);
    ({ contracts } = await e2eCoord.loadEnvironment());
  });

  describe('BalancerGaugeStaker.sol', function () {
    let staker: BalancerGaugeStaker;
    let daoSigner: any;
    let randomSigner: any;

    before(async function () {
      // Create the contract
      const factory = await ethers.getContractFactory('BalancerGaugeStaker');
      staker = await factory.deploy(
        contracts.core.address,
        contracts.balancerGaugeController.address,
        contracts.balancerMinter.address
      );
      await staker.deployTransaction.wait();

      // get signer for a random address
      randomSigner = await getImpersonatedSigner('0x6ef71cA9cD708883E129559F5edBFb9d9D5C6148');
      await forceEth(randomSigner.address);

      // seed the staker with some LP tokens
      const lpTokenHolder = '0x4f9463405f5bc7b4c1304222c1df76efbd81a407';
      const lpTokenSigner = await getImpersonatedSigner(lpTokenHolder);
      await forceEth(lpTokenHolder);
      await contracts.bpt30Fei70Weth.connect(lpTokenSigner).transfer(staker.address, `1000${e18}`);

      // also airdrop some BAL so that balance is not zero
      const balTokenHolder = '0xBA12222222228d8Ba445958a75a0704d566BF2C8';
      const balTokenSigner = await getImpersonatedSigner(balTokenHolder);
      await forceEth(balTokenHolder);
      await contracts.bal.connect(balTokenSigner).transfer(staker.address, '10000');

      // grant role to dao and initialize dao signer
      await forceEth(contracts.feiDAOTimelock.address);
      daoSigner = await getImpersonatedSigner(contracts.feiDAOTimelock.address);
      await contracts.core
        .connect(daoSigner)
        .grantRole(ethers.utils.id('METAGOVERNANCE_GAUGE_ADMIN'), daoSigner.address);
    });

    it('init', async function () {
      expect(await staker.balanceReportedIn()).to.be.equal(contracts.bal.address);
      expect(await staker.balance()).to.be.equal('10000');
      expect((await staker.resistantBalanceAndFei())[0]).to.be.equal('10000');
      expect((await staker.resistantBalanceAndFei())[1]).to.be.equal('0');
    });

    describe('setBalancerMinter()', function () {
      it('should revert if user has no role', async function () {
        await expectRevert(staker.setBalancerMinter(contracts.balancerMinter.address), 'UNAUTHORIZED');
      });

      it('should work if user has METAGOVERNANCE_GAUGE_ADMIN role', async function () {
        expect(await staker.balancerMinter()).to.be.equal(contracts.balancerMinter.address);
        await staker.connect(daoSigner).setBalancerMinter(deployAddress);
        expect(await staker.balancerMinter()).to.be.equal(deployAddress);
        await staker.connect(daoSigner).setBalancerMinter(contracts.balancerMinter.address);
        expect(await staker.balancerMinter()).to.be.equal(contracts.balancerMinter.address);
      });
    });

    describe('withdraw()', function () {
      it('should revert if user has no role', async function () {
        await expectRevert(
          staker.connect(randomSigner).withdraw(daoSigner.address, '10'),
          'CoreRef: Caller is not a PCV controller'
        );
      });

      it('should revert if contract is paused', async function () {
        await staker.connect(daoSigner).pause();
        await expectRevert(staker.withdraw(daoSigner.address, '10'), 'Pausable: paused');
        await staker.connect(daoSigner).unpause();
      });

      it('should work if user has PCV_CONTROLLER_ROLE role', async function () {
        const balanceBefore = await contracts.bal.balanceOf(daoSigner.address);
        await staker.connect(daoSigner).withdraw(daoSigner.address, '10');
        const balanceAfter = await contracts.bal.balanceOf(daoSigner.address);
        expect(balanceAfter.sub(balanceBefore)).to.be.equal('10');
        expect(await staker.balance()).to.be.equal('9990');
      });
    });

    describe('mintGaugeRewards()', function () {
      it('should revert for gauges that are not configured', async function () {
        await expectRevert(
          staker.mintGaugeRewards(contracts.bal.address),
          'BalancerGaugeStaker: token has no gauge configured'
        );
      });

      it('should be able to mint BAL', async function () {
        // set gauge and stake a bunch of tokens
        await staker
          .connect(daoSigner)
          .setTokenToGauge(contracts.bpt30Fei70Weth.address, contracts.balancerGaugeBpt30Fei70Weth.address);
        await staker.connect(daoSigner).stakeAllInGauge(contracts.bpt30Fei70Weth.address);

        staker.mintGaugeRewards(contracts.bpt30Fei70Weth.address);
        expect(await staker.balance()).to.be.at.least('9991');
        expect((await staker.resistantBalanceAndFei())[0]).to.be.at.least('9991');
        expect((await staker.resistantBalanceAndFei())[1]).to.be.equal('0');
      });
    });

    describe('withdrawERC20()', function () {
      it('should revert if user has no role', async function () {
        await expectRevert(
          staker.connect(randomSigner).withdraw(daoSigner.address, '10'),
          'CoreRef: Caller is not a PCV controller'
        );
      });

      it('should revert if contract is paused', async function () {
        await staker.connect(daoSigner).pause();
        await expectRevert(staker.withdraw(daoSigner.address, '10'), 'Pausable: paused');
        await staker.connect(daoSigner).unpause();
      });

      it('should work if user has PCV_CONTROLLER_ROLE role', async function () {
        const balanceBefore = await contracts.bal.balanceOf(daoSigner.address);
        await expectEvent(
          staker.connect(daoSigner).withdrawERC20(contracts.bal.address, daoSigner.address, '10'),
          staker,
          'WithdrawERC20',
          [daoSigner.address, contracts.bal.address, daoSigner.address, '10']
        );
        const balanceAfter = await contracts.bal.balanceOf(daoSigner.address);
        expect(balanceAfter.sub(balanceBefore)).to.be.equal('10');
      });
    });
  });
});
