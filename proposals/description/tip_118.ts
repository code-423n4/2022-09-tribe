import { ethers } from 'ethers';
import { TemplatedProposalDescription } from '@custom-types/types';

const tip_118: TemplatedProposalDescription = {
  title: 'TIP_118: Incentives withdrawal, PSM deprecation, agEUR redemption',
  commands: [
    // 1. Transfer all assets off the PSMs to the new empty PCV deposits
    // ETH PSM
    {
      target: 'ratioPCVControllerV2',
      values: '0',
      method: 'withdrawRatioERC20(address,address,address,uint256)',
      arguments: (addresses) => [
        addresses.ethPSM, // pcvDeposit
        addresses.weth, // token
        addresses.wethHoldingPCVDeposit, // to
        '10000' // basisPoints, 100%
      ],
      description: 'Migrate WETH from the ETH PSM to the new WETH Holding PCV deposit'
    },
    {
      target: 'ratioPCVControllerV2',
      values: '0',
      method: 'withdrawRatioERC20(address,address,address,uint256)',
      arguments: (addresses) => [
        addresses.ethPSM, // pcvDeposit
        addresses.fei, // token
        addresses.daiFixedPricePSM, // to
        '10000' // basisPoints, 100%
      ],
      description: 'Migrate FEI from ETH PSM to the DAI PSM'
    },

    // LUSD_PSM
    {
      target: 'ratioPCVControllerV2',
      values: '0',
      method: 'withdrawRatioERC20(address,address,address,uint256)',
      arguments: (addresses) => [
        addresses.lusdPSM, // pcvDeposit
        addresses.lusd, // token
        addresses.lusdHoldingPCVDeposit, // to
        '10000' // basisPoints, 100%
      ],
      description: 'Migrate LUSD from the LUSD PSM to the LUSD holding PCV deposit'
    },
    {
      target: 'ratioPCVControllerV2',
      values: '0',
      method: 'withdrawRatioERC20(address,address,address,uint256)',
      arguments: (addresses) => [
        addresses.lusdPSM, // pcvDeposit
        addresses.fei, // token
        addresses.daiFixedPricePSM, // to
        '10000' // basisPoints, 100%
      ],
      description: 'Migrate FEI from the LUSD PSM to the DAI PSM'
    },

    // 2. Revoke PSM permissions
    {
      target: 'core',
      values: '0',
      method: 'revokeRole(bytes32,address)',
      arguments: (addresses) => [ethers.utils.id('MINTER_ROLE'), addresses.ethPSM],
      description: 'Revoke MINTER_ROLE from ETH PSM'
    },
    {
      target: 'core',
      values: '0',
      method: 'revokeRole(bytes32,address)',
      arguments: (addresses) => [ethers.utils.id('MINTER_ROLE'), addresses.lusdPSM],
      description: 'Revoke MINTER_ROLE from LUSD PSM'
    },

    // RAI PSM does not have MINTER_ROLE

    // 3. Pause all unpaused functionality on the PSMs
    {
      target: 'raiPriceBoundPSM',
      values: '0',
      method: 'pauseRedeem()',
      arguments: (addresses) => [],
      description: 'Pause redemptions on the Rai Price bound PSM'
    },

    // 4. Unset deprecated PSMs as safe addresses
    {
      target: 'pcvGuardianNew',
      values: '0',
      method: 'unsetSafeAddresses(address[])',
      arguments: (addresses) => [[addresses.ethPSM, addresses.lusdPSM, addresses.raiPriceBoundPSM]],
      description: 'Unset the ETH, LUSD and RAI PSMs as safe addresses'
    },

    // Update Collaterization Oracle and set safe addresses
    {
      target: 'collateralizationOracle',
      values: '0',
      method: 'addDeposits(address[])',
      arguments: (addresses) => [
        [
          addresses.wethHoldingPCVDeposit,
          addresses.lusdHoldingPCVDeposit,
          addresses.daiHoldingPCVDeposit,
          addresses.voltHoldingPCVDeposit
        ]
      ],
      description: `
      Add the holding ERC20 deposits to the Collaterization Oracle.
      gOHM deposit not added as does not yet have an oracle.`
    },
    {
      target: 'pcvGuardianNew',
      values: '0',
      method: 'setSafeAddresses(address[])',
      arguments: (addresses) => [
        [
          addresses.wethHoldingPCVDeposit,
          addresses.lusdHoldingPCVDeposit,
          addresses.daiHoldingPCVDeposit,
          addresses.voltHoldingPCVDeposit,
          addresses.gOHMHoldingPCVDeposit
        ]
      ],
      description: 'Set all new ERC20 holding deposits as safe addresses on the PCV Guardian'
    },

    {
      target: 'collateralizationOracle',
      values: '0',
      method: 'removeDeposits(address[])',
      arguments: (addresses) => [
        [addresses.lusdPSM, addresses.ethPSM, addresses.aaveEthPCVDepositWrapper, addresses.voltDepositWrapper]
      ],
      description: `
      Remove LUSD PSM, ETH PSM, Aave ETH PCV Deposit wrapper and the Volt deposit wrapper from CR
      `
    },

    ///  PCV DRIP CONTROLLERS
    {
      target: 'aaveEthPCVDripController',
      values: '0',
      method: 'pause()',
      arguments: (addresses) => [],
      description: 'Pause the ETH PCV drip controller'
    },
    {
      target: 'raiPCVDripController',
      values: '0',
      method: 'pause()',
      arguments: (addresses) => [],
      description: 'Pause the RAI PCV drip controller'
    },
    {
      target: 'lusdPCVDripController',
      values: '0',
      method: 'pause()',
      arguments: (addresses) => [],
      description: 'Pause the LUSD PCV drip controller'
    },

    ///// Deprecate PSM skimmers
    {
      target: 'lusdPSMFeiSkimmer',
      values: '0',
      method: 'pause()',
      arguments: (addresses) => [],
      description: 'Pause the LUSD PSM Fei skimmer'
    },
    {
      target: 'core',
      values: '0',
      method: 'revokeRole(bytes32,address)',
      arguments: (addresses) => [ethers.utils.id('PCV_CONTROLLER_ROLE'), addresses.lusdPSMFeiSkimmer],
      description: 'Revoke PCV_CONTROLLER_ROLE from lusdPSMFeiSkimmer'
    },

    {
      target: 'ethPSMFeiSkimmer',
      values: '0',
      method: 'pause()',
      arguments: (addresses) => [],
      description: 'Pause the ETH PSM Fei skimmer'
    },
    {
      target: 'core',
      values: '0',
      method: 'revokeRole(bytes32,address)',
      arguments: (addresses) => [ethers.utils.id('PCV_CONTROLLER_ROLE'), addresses.ethPSMFeiSkimmer],
      description: 'Revoke PCV_CONTROLLER_ROLE from ethPSMFeiSkimmer'
    },

    //// Activate DAI PSM skimmer and burn Fei
    {
      target: 'core',
      values: '0',
      method: 'grantRole(bytes32,address)',
      arguments: (addresses) => [ethers.utils.id('PCV_CONTROLLER_ROLE'), addresses.daiFixedPricePSMFeiSkimmer],
      description: 'Grant PCV_CONTROLLER_ROLE to daiFixedPricePSMFeiSkimmer'
    },
    {
      target: 'daiFixedPricePSMFeiSkimmer',
      values: '0',
      method: 'skim()',
      arguments: (addresses) => [],
      description: 'Burn excess Fei on the DAI PSM. Will burn ~95M FEI'
    },

    ///// Send VOLT to it's holding ERC20 deposit
    {
      target: 'volt',
      values: '0',
      method: 'transfer(address,uint256)',
      arguments: (addresses) => [addresses.voltHoldingPCVDeposit, '10000000000000000000000000'],
      description: 'Move 10M VOLT from the DAO timelock to the VOLT holding PCV deposit'
    },

    ///// Send gOHM to it's holding ERC20 deposit
    {
      target: 'gOHM',
      values: '0',
      method: 'transfer(address,uint256)',
      arguments: (addresses) => [addresses.gOHMHoldingPCVDeposit, '577180000000000000000'],
      description: 'Send 577 gOHM from the DAO timelock to the gOHM holding PCV deposit'
    },

    // Withdraw excess TRIBE from reward system
    {
      target: 'erc20Dripper',
      values: '0',
      method: 'withdrawERC20(address,address,uint256)',
      arguments: (addresses) => [addresses.tribe, addresses.core, '2508838570600494412126519'],
      description: 'Withdraw 2.5M TRIBE from the ERC20 Dripper to the Core Treasury'
    },
    {
      target: 'votiumBriber3Crvpool',
      values: '0',
      method: 'withdrawERC20(address,address,uint256)',
      arguments: (addresses) => [addresses.tribe, addresses.core, '1725076846586787179639648'],
      description: `
      Withdraw all TRIBE from 3CRV Votium briber contract to the Core Treasury. 
      
      Withdraw is made up of 200k TRIBE pre-existing on this contract and then an additional 1.5M TRIBE 
      that was harvested from the stakingTokenWrapperBribe3Crvpool.
      `
    },
    {
      target: 'votiumBriberD3pool',
      values: '0',
      method: 'withdrawERC20(address,address,uint256)',
      arguments: (addresses) => [addresses.tribe, addresses.core, '232096077769383622085234'],
      description: `
      Withdraw all TRIBE from D3 Votium briber contract to the Core Treasury. 
      
      Withdraw is made up of 230k TRIBE that was harvested from the stakingTokenWrapperBribeD3pool.
      `
    },
    {
      target: 'rewardsDistributorAdmin',
      values: '0',
      method: '_grantComp(address,uint256)',
      arguments: (addresses) => [addresses.core, '150000000000000000000000'],
      description: `Withdraw excess 150k TRIBE from Rari delegator contract. There is 164k excess, leaving behind a buffer of 14k`
    },
    {
      target: 'tribalChief',
      values: '0',
      method: 'governorWithdrawTribe(uint256)',
      arguments: (addresses) => ['26800000000000000000000000'],
      description: `
      Withdraw remaining TRIBE from the Tribal Chief to the Core Treasury, leaving behind enough to fund outstanding
      rewards.
      
      Withdrawal amount = 
      (Tribal Chief balance before harvest 
            - (pending rewards, Uniswap-v2 FEI/TRIBE LP + Curve 3crv-FEI metapool LP + G-UNI DAI/FEI 0.05% fee tier)
      
      Withdrawal amount = 27.4M - 0.60M = 26.8M  
      (There is ~564k in pending rewards, leaving behind an additional ~35k TRIBE as buffer)
      `
    },

    //////////  TIP 114: Withdraw excess TRIBE from the rewards system
    ////  Revoke roles from contracts that interacted with Tribal Chief and rewards system
    {
      target: 'core',
      values: '0',
      method: 'revokeRole(bytes32,address)',
      arguments: (addresses) => [ethers.utils.id('TRIBAL_CHIEF_ADMIN_ROLE'), addresses.optimisticTimelock],
      description: ' Revoke TRIBAL_CHIEF_ADMIN_ROLE from OptimisticTimelock'
    },
    {
      target: 'core',
      values: '0',
      method: 'revokeRole(bytes32,address)',
      arguments: (addresses) => [ethers.utils.id('TRIBAL_CHIEF_ADMIN_ROLE'), addresses.tribalCouncilTimelock],
      description: ' Revoke TRIBAL_CHIEF_ADMIN_ROLE from Tribal Council timelock'
    },

    //// Transfer the admin of the Aave Tribe Incentives Controller Proxy to Aave governance
    {
      target: 'proxyAdmin',
      values: '0',
      method: 'changeProxyAdmin(address,address)',
      arguments: (addresses) => [addresses.aaveTribeIncentivesController, addresses.aaveLendingPoolAddressesProvider],
      description: `
      Transfer the admin of the Aave Tribe Incentives Controller Proxy to Aave governance, specifically 
      the LendingPoolAddressesProvider.
      `
    },

    //// agEUR Redemption
    {
      target: 'angleDelegatorPCVDeposit',
      values: '0',
      method: 'claimGaugeRewards(address)',
      arguments: (addresses) => [
        addresses.angleGaugeUniswapV2FeiAgEur // gauge
      ],
      description: 'Claim all unclaimed ANGLE rewards'
    },
    {
      target: 'ratioPCVControllerV2',
      values: '0',
      method: 'withdrawRatioERC20(address,address,address,uint256)',
      arguments: (addresses) => [
        addresses.angleDelegatorPCVDeposit, // pcvDeposit
        addresses.angle, // token
        addresses.tribalCouncilSafe, // to
        '10000' // basisPoints, 100%
      ],
      description: 'Migrate all ANGLE to TC Multisig where it can be sold'
    },
    {
      target: 'angleDelegatorPCVDeposit',
      values: '0',
      method: 'unstakeFromGauge(address,uint256)',
      arguments: (addresses) => [
        addresses.angleAgEurFeiPool, // token
        '9295203165522303785936702' // all LP tokens
      ],
      description: 'Unstake all agEUR/FEI Uniswap tokens from gauge'
    },
    {
      target: 'ratioPCVControllerV2',
      values: '0',
      method: 'withdrawRatioERC20(address,address,address,uint256)',
      arguments: (addresses) => [
        addresses.angleDelegatorPCVDeposit, // pcvDeposit
        addresses.angleAgEurFeiPool, // token
        addresses.agEurUniswapPCVDeposit, // to
        '10000' // basisPoints, 100%
      ],
      description: 'Move all agEUR/FEI Uniswap tokens to PCV deposit'
    },
    {
      target: 'ratioPCVControllerV2',
      values: '0',
      method: 'withdrawRatio(address,address,uint256)',
      arguments: (addresses) => [
        addresses.agEurUniswapPCVDeposit, // pcvDeposit
        addresses.agEurUniswapPCVDeposit, // to
        '10000' // basisPoints, 100%
      ],
      description: 'Remove all agEUR/FEI Uniswap liquidity & burn FEI'
    },
    {
      target: 'ratioPCVControllerV2',
      values: '0',
      method: 'withdrawRatioERC20(address,address,address,uint256)',
      arguments: (addresses) => [
        addresses.agEurUniswapPCVDeposit, // pcvDeposit
        addresses.agEUR, // token
        addresses.angleEuroRedeemer, // to
        '10000' // basisPoints, 100%
      ],
      description: 'Move all agEUR to redeemer'
    },
    {
      target: 'collateralizationOracle',
      values: '0',
      method: 'removeDeposits(address[])',
      arguments: (addresses) => [[addresses.agEurUniswapPCVDeposit, addresses.uniswapLensAgEurUniswapGauge]],
      description: 'Remove agEUR addresses from CR oracle'
    },
    {
      target: 'pcvGuardianNew',
      values: '0',
      method: 'unsetSafeAddress(address)',
      arguments: (addresses) => [addresses.agEurUniswapPCVDeposit],
      description: 'Remove agEurUniswapPCVDeposit from safe addresses'
    },
    {
      target: 'angleEuroRedeemer',
      values: '0',
      method: 'redeemAgEurToDai()',
      arguments: (addresses) => [],
      description: 'Redeem all agEUR for DAI and send to DAI PSM'
    }
  ],
  description: `
  TIP_118: Deprecating PSMs, deprecating TRIBE incentives system, redeem agEUR

  This proposal deprecates the ETH, LUSD and RAI PSMs and associated infrastructure as well as completing
  the TRIBE incentives system deprecation. It also redeems all agEUR in the PCV to DAI.

  PSM deprecation
  --------------------------------------------
  The proposal deprecates the ETH, LUSD and RAI PSMs. This involves transferring all assets off these PSMs, 
  revoking their MINTER_ROLE, ensuring they are fully paused. It also pauses the the associated PCV drip controllers and 
  deprecates the Fei skimmers. Going forward, the only active PSM will be the DAI PSM.

  The DAI FEI skimmer is also activated by granting the PCV_CONTROLLER_ROLE and excess FEI skimmed. gOHM and VOLT are transferred
  from the DAO timelock to the relevant holding deposits.

  In addition, a new type of PCV deposit, the ERC20HoldingPCVDeposit, is deployed. This is a deposit which has 
  the deposit() method as a no-op and is intended to just hold assets. 


  TIP-114: Deprecate TRIBE Incentives system
  --------------------------------------------
  The proposal finishes the deprecation of the TRIBE incentives system by withdrawing the excess TRIBE from the system
  and deprecating the Tribal Chief contract. 

  Specifically it:
  - Withdraws remaining TRIBE from the TribalChief, leaving enough behind to fully fund existing commitments
  - Withdraws all TRIBE from 3Crv and D3 Votium briber contracts
  - Withdraws remaining TRIBE from ERC20 Dripper
  - Revokes no longer needed TRIBAL_CHIEF_ADMIN_ROLE roles
  - Transfers the admin of the Aave Fei Incentives Controller Proxy to Aave Governance

  TIP-110: agEUR & Angle redeem
  --------------------------------------------
  Convert all agEUR in the PCV to DAI, and deprecate all Angle Protocol-related contracts, except the contract that is holding vote-escrowed ANGLE.

  This proposal will perform the following actions :
  - Move all ANGLE rewards to TC Multisig where they can be sold
  - Unstake from Angle Protocol's Gauge all agEUR/FEI Uniswap tokens
  - Move all agEUR/FEI Uniswap tokens to PCV deposit
  - Remove all agEUR/FEI Uniswap liquidity & burn FEI
  - Redeem agEUR for DAI, and send proceeds to DAI PSM
  - Unset agEUR safe addresses & CR oracle entries
  `
};

export default tip_118;
