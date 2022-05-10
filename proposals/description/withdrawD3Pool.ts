import { ProposalDescription } from '@custom-types/types';

const fip_x: ProposalDescription = {
  // Curve/Convex reports balance in USD
  title: 'Withdraw from the D3Pool',
  commands: [
    {
      target: 'core',
      values: '0',
      method: 'grantPCVController(address)',
      arguments: ['{daiFixedPriceFeiSkimmer}'],
      description: 'Grant PCV Controller to daiFixedPriceFeiSkimmer'
    },
    {
      target: 'pcvGuardianNew',
      values: '0',
      method: 'withdrawToSafeAddress(address,address,uint256,bool,bool)',
      arguments: [
        '{d3poolConvexPCVDeposit}',
        '{d3poolCurvePCVDeposit}',
        '30000000000000000000000000',
        'false',
        'false'
      ],
      description: 'Withdraw 30M USD worth of LP tokens to the d3PoolCurvePCVDeposit'
    },
    {
      target: 'pcvGuardianNew',
      values: '0',
      method: 'withdrawToSafeAddress(address,address,uint256,bool,bool)',
      arguments: ['{d3poolCurvePCVDeposit}', '{daiFixedPricePSM}', '10000000000000000000000000', 'false', 'false'],
      description: 'Withdraw 10M worth of Fei from the Curve D3 pool to the DAI PSM'
    },
    {
      target: 'daiPSMSkimmer',
      values: '0',
      method: 'skim()',
      arguments: [],
      description: 'Skim all the Fei on the DAI PSM - burn it'
    }
  ],
  description: `
  Withdraw 30M USD worth of LP tokens from the d3 pool on Curve. 
  
  Send the LP tokens to the d3PoolCurvePCVDeposit and then withdraw 10M FEI from the pool to the DAI PSM. 

  Then skim all the FEI on the DAI PSM and burn it.
  `
};

export default fip_x;
