const {
  BN,
  expectEvent,
  expectRevert,
  expect,
  getCore,
  getAddresses,
  getWeb3Addresses,
} = require('../helpers');
const { time } = require('@openzeppelin/test-helpers');

const Tribe = artifacts.require('MockTribe');
const MockCoreRef = artifacts.require('MockCoreRef');
const MasterChief = artifacts.require('MasterChief');
const MockERC20 = artifacts.require('MockERC20');
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const ONE_ADDRESS = '0x0000000000000000000000000000000000000001';

describe('MasterChief', function () {
  let pid;
  let userAddress;
  let minterAddress;
  let governorAddress;
  let secondUserAddress;
  let thirdUserAddress;
  let accounts;

  const allocationPoints = 100;
  const totalStaked = '100000000000000000000';
  const perBlockReward = Number(100000000000000000000);

  beforeEach(async function () {
    ({
      userAddress,
      minterAddress,
      burnerAddress,
      pcvControllerAddress,
      governorAddress,
      genesisGroup,
      guardianAddress,
    } = await getAddresses());
    accounts = await getWeb3Addresses();
    secondUserAddress = accounts[2];
    thirdUserAddress = accounts[3];

    this.core = await getCore(false);

    this.tribe = await Tribe.new();
    this.coreRef = await MockCoreRef.new(this.core.address);

    this.masterChief = await MasterChief.new(this.core.address, this.tribe.address);
    const mintAmount = '1000000000000000000000000000000000000000000000';

    // create and mint LP tokens
    this.curveLPToken = await MockERC20.new();
    await this.curveLPToken.mint(userAddress, mintAmount);
    await this.curveLPToken.mint(secondUserAddress, mintAmount);
    
    this.LPToken = await MockERC20.new();
    await this.LPToken.mint(userAddress, mintAmount);
    await this.LPToken.mint(secondUserAddress, mintAmount);
    await this.LPToken.mint(thirdUserAddress, mintAmount);

    // mint tribe tokens to the masterchief contract to distribute as rewards
    await this.tribe.mint(this.masterChief.address, mintAmount, { from: minterAddress });

    // create new reward stream
    const tx = await this.masterChief.add(allocationPoints, this.LPToken.address, ZERO_ADDRESS, { from: governorAddress });
    // grab PID from the logs
    pid = Number(tx.logs[0].args.pid);

    this.minterRole = await this.core.MINTER_ROLE();
    this.burnerRole = await this.core.BURNER_ROLE();
    this.governorRole = await this.core.GOVERN_ROLE();
    this.pcvControllerRole = await this.core.PCV_CONTROLLER_ROLE();
    this.guardianRole = await this.core.GUARDIAN_ROLE();
  });

  describe('Test Security', function() {
    it('should not be able to add rewards stream as non governor', async function() {
        await expectRevert(
            this.masterChief.add(allocationPoints, this.LPToken.address, this.tribe.address, { from: userAddress }),
            "CoreRef: Caller is not a governor",
        );
    });

    it('should not be able to set rewards stream as non governor', async function() {
        await expectRevert(
            this.masterChief.set(0, allocationPoints, this.LPToken.address, true, { from: userAddress }),
            "CoreRef: Caller is not a governor",
        );
    });

    it('should not be able to setMigrator as non governor', async function() {
        await expectRevert(
            this.masterChief.setMigrator(this.LPToken.address, { from: userAddress }),
            "CoreRef: Caller is not a governor",
        );
    });

    it('should not be able to governorWithdrawTribe as non governor', async function() {
        await expectRevert(
            this.masterChief.governorWithdrawTribe('100000000', { from: userAddress }),
            "CoreRef: Caller is not a governor",
        );
    });

    it('should not be able to updateBlockReward as non governor', async function() {
        await expectRevert(
            this.masterChief.updateBlockReward('100000000', { from: userAddress }),
            "CoreRef: Caller is not a governor",
        );
    });
  });

  describe('Test Staking', function() {
    it('should be able to stake LP Tokens', async function() {
        await this.LPToken.approve(this.masterChief.address, totalStaked);
        await this.masterChief.deposit(pid, totalStaked, userAddress, { from: userAddress })
    });

    it('should be able to get pending sushi', async function() {
        await this.LPToken.approve(this.masterChief.address, totalStaked);
        await this.masterChief.deposit(pid, totalStaked, userAddress, { from: userAddress });

        const advanceBlockAmount = 100;
        for (let i = 0; i < advanceBlockAmount; i++) {
            await time.advanceBlock();
        }

        expect(Number(await this.masterChief.pendingSushi(pid, userAddress))).to.be.equal(perBlockReward * advanceBlockAmount);
    });

    it('should be able to get pending sushi after one block with a single pool and user staking', async function() {
        await this.LPToken.approve(this.masterChief.address, totalStaked);
        await this.masterChief.deposit(pid, totalStaked, userAddress, { from: userAddress });

        await time.advanceBlock();

        expect(Number(await this.masterChief.pendingSushi(pid, userAddress))).to.be.equal(perBlockReward);
    });

    it('should be able to step down rewards by creating a new PID for curve with equal allocation points after 200 blocks, then go another 200 blocks', async function() {
        await this.LPToken.approve(this.masterChief.address, totalStaked, { from: userAddress });
        await this.masterChief.deposit(pid, totalStaked, userAddress, { from: userAddress });

        const advanceBlockAmount = 200;
        for (let i = 0; i < advanceBlockAmount; i++) {
            await time.advanceBlock();
        }
        expect(Number(await this.masterChief.pendingSushi(pid, userAddress))).to.be.equal(perBlockReward * advanceBlockAmount);

        await this.masterChief.harvest(pid, userAddress, { from: userAddress });

        // add on one to the advance block amount as we have advanced one more block when calling the harvest function
        expect(Number(await this.tribe.balanceOf(userAddress))).to.be.equal(perBlockReward * (advanceBlockAmount + 1));

        // adding another PID for curve will cut user rewards in half for users staked in the first pool
        const pid2 = Number(
            (await this.masterChief.add(allocationPoints, this.curveLPToken.address, ZERO_ADDRESS, { from: governorAddress }))
            .logs[0].args.pid
        );

        await this.curveLPToken.approve(this.masterChief.address, totalStaked, { from: secondUserAddress });
        await this.masterChief.deposit(pid2, totalStaked, secondUserAddress, { from: secondUserAddress });

        // burn tribe tokens to make life easier when calculating rewards after this step up
        await this.tribe.transfer(ONE_ADDRESS, (await this.tribe.balanceOf(userAddress)).toString());

        // we did 5 tx's before starting and then do 1 tx to harvest so start with i at 3.
        for (let i = 5; i < advanceBlockAmount; i++) {
            await time.advanceBlock();
        }

        await this.masterChief.harvest(pid, userAddress, { from: userAddress });
        // add on one to the advance block amount as we have advanced one more block when calling the harvest function
        expect(Number(await this.tribe.balanceOf(userAddress))).to.be.equal( (perBlockReward / 2)  * (advanceBlockAmount));

        await this.masterChief.harvest(pid2, secondUserAddress, { from: secondUserAddress });

        // subtract 2 from the advance block amount as we have advanced two less blocks when calling the harvest function
        expect(Number(await this.tribe.balanceOf(secondUserAddress))).to.be.equal( (perBlockReward / 2)  * (advanceBlockAmount - 2));
    });

    it('should be able to step down rewards by halving rewards per block after 200 blocks, then go another 200 blocks', async function() {
        await this.LPToken.approve(this.masterChief.address, totalStaked, { from: userAddress });
        await this.masterChief.deposit(pid, totalStaked, userAddress, { from: userAddress });

        const advanceBlockAmount = 200;
        for (let i = 0; i < advanceBlockAmount; i++) {
            await time.advanceBlock();
        }
        expect(Number(await this.masterChief.pendingSushi(pid, userAddress))).to.be.equal(perBlockReward * advanceBlockAmount);

        await this.masterChief.harvest(pid, userAddress, { from: userAddress });

        // add on one to the advance block amount as we have advanced one more block when calling the harvest function
        expect(Number(await this.tribe.balanceOf(userAddress))).to.be.equal(perBlockReward * (advanceBlockAmount + 1));

        await this.masterChief.updateBlockReward('50000000000000000000', { from: governorAddress });
        // burn tribe tokens to make life easier when calculating rewards after this step up
        await this.tribe.transfer(ONE_ADDRESS, (await this.tribe.balanceOf(userAddress)).toString());

        // we did 5 tx's before starting and then do 1 tx to harvest so start with i at 3.
        for (let i = 3; i < advanceBlockAmount; i++) {
            await time.advanceBlock();
        }

        await this.masterChief.harvest(pid, userAddress, { from: userAddress });
        // add on one to the advance block amount as we have advanced one more block when calling the harvest function
        expect(Number(await this.tribe.balanceOf(userAddress))).to.be.equal( (perBlockReward / 2)  * (advanceBlockAmount));
    });

    it('should be able to step down rewards by creating a new PID with equal allocation points after 200 blocks, then go another 200 blocks', async function() {
        await this.LPToken.approve(this.masterChief.address, totalStaked, { from: userAddress });
        await this.masterChief.deposit(pid, totalStaked, userAddress, { from: userAddress });

        const advanceBlockAmount = 200;
        for (let i = 0; i < advanceBlockAmount; i++) {
            await time.advanceBlock();
        }

        expect(Number(await this.masterChief.pendingSushi(pid, userAddress))).to.be.equal(perBlockReward * advanceBlockAmount);

        await this.masterChief.harvest(pid, userAddress, { from: userAddress });

        // add on one to the advance block amount as we have advanced one more block when calling the harvest function
        expect(Number(await this.tribe.balanceOf(userAddress))).to.be.equal(perBlockReward * (advanceBlockAmount + 1));

        // adding another PID will cut user rewards in half for users staked in the first pool
        await this.masterChief.add(allocationPoints, this.LPToken.address, ZERO_ADDRESS, { from: governorAddress });

        // burn tribe tokens to make life easier when calculating rewards after this step up
        await this.tribe.transfer(ONE_ADDRESS, (await this.tribe.balanceOf(userAddress)).toString());

        // we did 2 tx's before starting and then do 1 tx to harvest so start with i at 3.
        for (let i = 3; i < advanceBlockAmount; i++) {
            await time.advanceBlock();
        }

        await this.masterChief.harvest(pid, userAddress, { from: userAddress });
        // add on one to the advance block amount as we have advanced one more block when calling the harvest function
        expect(Number(await this.tribe.balanceOf(userAddress))).to.be.equal( (perBlockReward / 2)  * (advanceBlockAmount));
    });

    it('should be able to get pending sushi 200 blocks', async function() {
        await this.LPToken.approve(this.masterChief.address, totalStaked, { from: userAddress });
        await this.masterChief.deposit(pid, totalStaked, userAddress, { from: userAddress });

        const advanceBlockAmount = 200;
        for (let i = 0; i < advanceBlockAmount; i++) {
            await time.advanceBlock();
        }

        expect(Number(await this.masterChief.pendingSushi(pid, userAddress))).to.be.equal(perBlockReward * advanceBlockAmount);
        
        await this.masterChief.harvest(pid, userAddress, { from: userAddress });
        // add on one to the advance block amount as we have advanced one more block when calling the harvest function
        expect(Number(await this.tribe.balanceOf(userAddress))).to.be.equal(perBlockReward * (advanceBlockAmount + 1));
    });

    it('should be able to get pending sushi 200 blocks with 2 users staking', async function() {
        await this.LPToken.approve(this.masterChief.address, totalStaked, { from: userAddress });
        await this.LPToken.approve(this.masterChief.address, totalStaked, { from: secondUserAddress });

        await this.masterChief.deposit(pid, totalStaked, userAddress, { from: userAddress });
        await this.masterChief.deposit(pid, totalStaked, secondUserAddress, { from: secondUserAddress });

        const advanceBlockAmount = 200;
        for (let i = 0; i < advanceBlockAmount; i++) {
            await time.advanceBlock();
        }

        expect(Number(await this.masterChief.pendingSushi(pid, userAddress))).to.be.equal( ( ( perBlockReward * advanceBlockAmount ) / 2 ) + perBlockReward );
        
        await this.masterChief.harvest(pid, secondUserAddress, { from: secondUserAddress });
        // add on one to the advance block amount as we have advanced one more block when calling the harvest function
        expect(Number(await this.tribe.balanceOf(secondUserAddress))).to.be.equal( ( ( perBlockReward * advanceBlockAmount ) / 2 ) + perBlockReward / 2 );
        
        await this.masterChief.harvest(pid, userAddress, { from: userAddress });
        // add on one to the advance block amount as we have advanced one more block when calling the harvest function
        expect(Number(await this.tribe.balanceOf(userAddress))).to.be.equal( ( ( perBlockReward * advanceBlockAmount ) / 2 ) + perBlockReward * 2 );
    });

    it('should be able to distribute sushi after 200 blocks with 3 users staking', async function() {
        // approve actions
        await this.LPToken.approve(this.masterChief.address, totalStaked, { from: userAddress });
        
        await this.LPToken.approve(this.masterChief.address, totalStaked, { from: secondUserAddress });
        await this.LPToken.approve(this.masterChief.address, totalStaked, { from: thirdUserAddress });
        
        // deposit actions
        await this.masterChief.deposit(pid, totalStaked, userAddress, { from: userAddress });
        await this.masterChief.deposit(pid, totalStaked, secondUserAddress, { from: secondUserAddress });
        await this.masterChief.deposit(pid, totalStaked, thirdUserAddress, { from: thirdUserAddress });

        const advanceBlockAmount = 200;
        for (let i = 0; i < advanceBlockAmount; i++) {
            await time.advanceBlock();
        }

        await this.masterChief.deposit(pid, 0, thirdUserAddress, { from: thirdUserAddress });
        // console.log(`sushi provided user1: ${Number((await this.masterChief.userInfo(pid, userAddress)).amount)} reward debt ${Number((await this.masterChief.userInfo(pid, userAddress)).rewardDebt)}`);
        // console.log(`sushi provided user2:  ${Number((await this.masterChief.userInfo(pid, secondUserAddress)).amount)} reward debt ${Number((await this.masterChief.userInfo(pid, secondUserAddress)).rewardDebt)}`);
        // console.log(`sushi provided user3: ${Number((await this.masterChief.userInfo(pid, thirdUserAddress)).amount)} reward debt ${Number((await this.masterChief.userInfo(pid, thirdUserAddress)).rewardDebt)}`);

        await this.masterChief.harvest(pid, userAddress, { from: userAddress });
        await this.masterChief.harvest(pid, secondUserAddress, { from: secondUserAddress });
        await this.masterChief.harvest(pid, thirdUserAddress, { from: thirdUserAddress });
    });

    it('should be able to assert poolLength', async function() {
        expect(Number(await this.masterChief.poolLength())).to.be.equal(1);
    });
  });
});
