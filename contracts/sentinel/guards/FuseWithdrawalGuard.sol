// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.4;

import "../IGuard.sol";
import "../../refs/CoreRef.sol";
import "../../pcv/compound/ERC20CompoundPCVDeposit.sol";
import "../../pcv/PCVGuardian.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

contract FuseWithdrawalGuard is IGuard, CoreRef {
    using EnumerableSet for EnumerableSet.AddressSet;

    struct WithdrawInfo {
        address destination;
        address underlying;
        uint96 liquidityToLeave;
    }

    /// @notice map the destination and minimum liquidity for each pcv deposit
    mapping(address => WithdrawInfo) public withdrawInfos;

    EnumerableSet.AddressSet private fuseDeposits;

    /// @notice the PCV mover contract exposed to guardian role
    PCVGuardian public constant pcvGuardian = PCVGuardian(0x02435948F84d7465FB71dE45ABa6098Fc6eC2993);

    /// @notice the minimum amount of underlying which can be withdrawn from a cToken that registers in the guard.
    /// i.e. if the min is 100 FEI but the amount in the contract is 1 FEI, the amountToWithdraw will return 0 and the check will fail
    /// @dev added to prevent dust from bricking the contract
    uint256 public constant MIN_WITHDRAW = 100e18;

    constructor(
        address core,
        address[] memory deposits,
        address[] memory destinations,
        address[] memory underlyings,
        uint96[] memory liquidityToLeaveList
    ) CoreRef(core) {
        uint256 len = deposits.length;
        require(len == destinations.length && len == liquidityToLeaveList.length && len == underlyings.length);
        for (uint256 i = 0; i < len; ) {
            fuseDeposits.add(deposits[i]);
            withdrawInfos[deposits[i]] = WithdrawInfo({
                destination: destinations[i],
                underlying: underlyings[i],
                liquidityToLeave: liquidityToLeaveList[i]
            });
            unchecked {
                ++i;
            }
        }
    }

    /// @notice setter for the Fuse deposit destination and minimum liquidity
    function setWithdrawInfo(address deposit, WithdrawInfo calldata withdrawInfo)
        public
        hasAnyOfThreeRoles(TribeRoles.GUARDIAN, TribeRoles.GOVERNOR, TribeRoles.PCV_SAFE_MOVER_ROLE)
    {
        withdrawInfos[deposit] = withdrawInfo;
    }

    /// @notice check if contract can be called. If any deposit has a nonzero withdraw amount available, then return true.
    function check() external view override returns (bool) {
        for (uint256 i = 0; i < fuseDeposits.length(); ) {
            if (getAmountToWithdraw(ERC20CompoundPCVDeposit(fuseDeposits.at(i))) > 0) return true;
            unchecked {
                ++i;
            }
        }
        return false;
    }

    /// @notice return the amount that can be withdrawn from a deposit after leaving min liquidity
    function getAmountToWithdraw(ERC20CompoundPCVDeposit deposit) public view returns (uint256) {
        // can't read underlying directly because some of the PCV deposits use an old abi
        IERC20 underlying = IERC20(withdrawInfos[address(deposit)].underlying);
        // Reserves of underlying left in the cToken are considered withdrawable liquidity
        uint256 liquidity = underlying.balanceOf(address(deposit.cToken()));
        uint256 liquidityToLeave = withdrawInfos[address(deposit)].liquidityToLeave;
        if (liquidity <= liquidityToLeave) {
            return 0;
        }
        // take away min liquidity when calculating how much to withdraw.
        liquidity -= liquidityToLeave;

        // max withdraw is the pcv deposit balance
        uint256 withdrawAmount = deposit.balance();
        if (withdrawAmount > liquidity) {
            withdrawAmount = liquidity;
        }
        return withdrawAmount > MIN_WITHDRAW ? withdrawAmount : 0;
    }

    /// @notice return the first element which can be withdrawn from with the appropriate calldata encoding tha max withdraw amount.
    /// @dev it only returns one element for simplicity. Unlikely multiple will be withdrawable simulteneously after the first pass, and pruning empty entries from a sparse array is an inefficient and inelegant algorithm in solidity.
    function getProtecActions()
        external
        view
        override
        returns (
            address[] memory targets,
            bytes[] memory datas,
            uint256[] memory values
        )
    {
        for (uint256 i = 0; i < fuseDeposits.length(); ) {
            uint256 amount = getAmountToWithdraw(ERC20CompoundPCVDeposit(fuseDeposits.at(i)));
            if (amount > 0) {
                targets = new address[](1);
                targets[0] = address(pcvGuardian);
                datas = new bytes[](1);
                datas[0] = abi.encodeWithSelector(
                    PCVGuardian.withdrawToSafeAddress.selector,
                    fuseDeposits.at(i),
                    withdrawInfos[fuseDeposits.at(i)].destination,
                    amount,
                    false,
                    false
                );
                values = new uint256[](1);
                return (targets, datas, values);
            }
            unchecked {
                ++i;
            }
        }
    }
}
