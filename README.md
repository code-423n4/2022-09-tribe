# FEI and TRIBE Redemption Contest Details
- $42,000 USDC main award pot
- $0 USDC gas optimization award pot
- Join [C4 Discord](https://discord.gg/code4rena) to register
- Submit findings [using the C4 form](https://code4rena.com/contests/2022-09-fei-and-tribe-redemption-contest/submit)
- [Read our guidelines for more details](https://docs.code4rena.com/roles/wardens)
- Starts September 09, 2022 20:00 UTC
- Ends September 12, 2022 20:00 UTC

## Setup Instructions and Codebase Overview: 
- [Protocol Readme](https://github.com/code-423n4/2022-09-tribe/blob/main/protocolReadme.md)
- [Protocol Docs](https://docs.fei.money)

Setup TLDR:
```
# Install dependencies:
npm install && npm run setup:forge
# Build and compile contracts (both via hardhat *and* forge) and generate types: 
npm run build
# Run forge tests: 
npm run test
# Run hardhat tests (takes >10min and may need a prior `export NODE_OPTIONS=--max-old-space-size=8192` to avoid an out of memory error): 
npm run test:hardhat
```

## Contracts in Scope

### Scope table
```
| File                                                                   | nLines |
|------------------------------------------------------------------------|--------|
| contracts/peg/SimpleFeiDaiPSM.sol                                      | 103    |
| contracts/shutdown/fuse/RariMerkleRedeemer.sol                         | 218    |
| contracts/shutdown/fuse/MerkleRedeemerDripper.sol                      | 29     |
| contracts/shutdown/redeem/TribeRedeemer.sol                            | 73     |
| Totals                                                                 | 423    |

All other contracts are **not in scope**.
```

Note 1: For the RariMerkleRedeemer & MerkleRedeemerDripper contracts, please see the [readme here](https://github.com/code-423n4/2022-09-tribe/blob/main/contracts/shutdown/fuse/MerkleReedeemerSpec.md) for additional information.
 
Note 2: For each contract, thare are unit and integration tests linked below. There also exist some tests in the "verification" step of the dao vote which that contract corresponds to; these tests are executed when the DAO vote is simulated as part of the integration test setup.
 - [TIP-121b](https://github.com/code-423n4/2022-09-tribe/blob/main/proposals/dao/tip_121b.ts)
 - [TIP-121c](https://github.com/code-423n4/2022-09-tribe/blob/main/proposals/dao/tip_121c.ts)

### [RariMerkleRedeemer](https://github.com/code-423n4/2022-09-tribe/blob/main/contracts/shutdown/fuse/RariMerkleRedeemer.sol)
 - sLoC: ~150
 - External contracts called: FEI ERC-20 token, Fuse cTokens
 - Libraries: OpenZeppelin

This contract performs a "merkle swap" between Fuse cTokens and FEI at a pre-determined exchange rate per cToken up to a configured cap per address in the merkle root. There is one merkle root and one exchange rate per cToken. The merkle nodes contain the user address and amount of cTokens which can swap for FEI.

Only EOA addresses will be listed in the merkle nodes, as addresses also need to perform an ECDSA signature on a message to claim the swap.

It should be impossible to claim any assets from the Merkle Redeemer unless included in the merkle tree. It should be impossible to redeem without signing the message. Users with outstanding borrows on Fuse should not be able to claim in full until paying off their debt (cTokens prevent transfers when actively used as collateral for a borrow). All EOA users in the merkle tree should be able to claim in full assuming they have the cTokens, no borrows against them, and the contract is funded.

Tooling for creating merkle trees can be found in [scripts/shutdown/](https://github.com/code-423n4/2022-09-tribe/blob/main/scripts/shutdown/), and documentation for this tooling can be found in [this readme](https://github.com/code-423n4/2022-09-tribe/blob/main/scripts/shutdown/repayment-test-tooling-spec.md).

Test info:

 - See verification step of [TIP-121b](https://github.com/code-423n4/2022-09-tribe/blob/main/proposals/dao/tip_121b.ts) for some basic verification tests.
 - [Forge Unit Tests](https://github.com/code-423n4/2022-09-tribe/blob/main/contracts/test/unit/shutdown/fuse/rariMerkleRedeemer.t.sol)
 - [Forge Integration Tests](https://github.com/code-423n4/2022-09-tribe/blob/main/contracts/test/integration/shutdown/fuse/rariMerkleRedeemer.t.sol)

### [MerkleRedeemerDripper](https://github.com/code-423n4/2022-09-tribe/blob/main/contracts/shutdown/fuse/MerkleRedeemerDripper.sol)
 - sLoC: ~10 (with ~200 in inheritance chain)
 - External contracts called: FEI ERC-20 token, Fei Protocol Core ACL

This contract is intended to drip FEI into the immutable RariMerkleRedeemer contract as a security/rate limiting mechanism. In the event of an unlikely issue, the dripper can be paused making the maximum attack surface the funds in the RariMerkleRedeemer.

Test info:

 - See verification step of [TIP-121b](https://github.com/code-423n4/2022-09-tribe/blob/main/proposals/dao/tip_121b.ts) for all tests for this contract.
 - For unit tests of the ERC20Dripper that it inherits from, see [here](https://github.com/code-423n4/2022-09-tribe/blob/main/test/unit/pcv/utils/ERC20Dripper.test.ts)
 - For integration tests of the ERC20Dripper that it inherits from, see [here](https://github.com/code-423n4/2022-09-tribe/blob/main/test/integration/tests/pcv.ts)

### [SimpleFeiDaiPSM](https://github.com/code-423n4/2022-09-tribe/blob/main/contracts/peg/SimpleFeiDaiPSM.sol)
 - sLoC: ~75
 - External contracts called: FEI and DAI ERC-20 token
 - Libraries: OpenZeppelin

This contract is intended to be an immutable FEI-DAI wrapper (like WETH:ETH) which allows 1:1 minting and redemption. This contract should stay synced between the FEI and DAI supplies after each call to `burnFeiHeld()`, assuming it is seeded with enough DAI to match the circulating supply.

Note 1: The contract uses the same abi as other PSMs in fei protocol, with some null and no-op functionality for completeness.

Note 2: Some FEI in existence is "protocol owned" and would be sent directly to this contract to be burned, and not backed by DAI. Hence the `burnFeiHeld()`

Test info:

 - See verification step of [TIP-121c](https://github.com/code-423n4/2022-09-tribe/blob/main/proposals/dao/tip_121c.ts) for some basic verification tests.
 - [Hardhat Integration Tests](https://github.com/code-423n4/2022-09-tribe/blob/main/test/integration/tests/simpleFeiDaiPSM.ts)

### [TribeRedeemer](https://github.com/code-423n4/2022-09-tribe/blob/main/contracts/shutdown/redeem/TribeRedeemer.sol)
 - sLoC: ~50
 - External contracts called: FEI, DAI, stETH, FOX, LQTY ERC-20 tokens
 - Libraries: OpenZeppelin

Intended to redeem TRIBE from the effective circulating supply in exchange for a pro rata portion of a list of ERC-20 tokens.

Test info:
 - [Forge Unit Tests](https://github.com/code-423n4/2022-09-tribe/blob/main/contracts/test/unit/shutdown/redeemer/TribeRedeemer.t.sol)

