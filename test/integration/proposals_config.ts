import { ProposalCategory, ProposalsConfigMap } from '@custom-types/types';

import oa_cr_fix from '@proposals/description/oa_cr_fix';
import withdraw_aave_comp_fei from '@proposals/description/withdraw_aave_comp_fei';
// import fip_xx_proposal from '@proposals/description/fip_xx';

const proposals: ProposalsConfigMap = {
  withdraw_aave_comp_fei: {
    deploy: true, // deploy flag for whether to run deploy action during e2e tests or use mainnet state
    totalValue: 0, // amount of ETH to send to DAO execution
    proposal: withdraw_aave_comp_fei, // full proposal file, imported from '@proposals/description/fip_xx.ts'
    proposalId: '',
    affectedContractSignoff: [''],
    deprecatedContractSignoff: [''],
    category: ProposalCategory.TC
  },
  oa_cr_fix: {
    deploy: false, // deploy flag for whether to run deploy action during e2e tests or use mainnet state
    totalValue: 0, // amount of ETH to send to DAO execution
    proposal: oa_cr_fix, // full proposal file, imported from '@proposals/description/fip_xx.ts'
    proposalId: '',
    affectedContractSignoff: ['collateralizationOracle', 'balancerLensBpt30Fei70Weth'],
    deprecatedContractSignoff: [
      'balancerLensBpt30Fei70WethOld',
      'rariPool8FeiPCVDepositWrapper',
      'rariPool8DaiPCVDeposit',
      'rariPool8LusdPCVDeposit',
      'rariPool18FeiPCVDepositWrapper',
      'rariPool27FeiPCVDepositWrapper',
      'rariPool90FeiPCVDepositWrapper',
      'rariPool146EthPCVDeposit',
      'convexPoolPCVDepositWrapper'
    ],
    category: ProposalCategory.OA
  }
};

export default proposals;
