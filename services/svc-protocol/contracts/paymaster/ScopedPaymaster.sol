// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PackedUserOperation} from "../interfaces/IAccount.sol";
import {IPaymaster} from "../interfaces/IPaymaster.sol";

/**
 * SCOPED PAYMASTER — S-A10 contract half (`socket.paymaster-policy`).
 *
 * Holds a native float and, when the EntryPoint asks, agrees to sponsor a
 * UserOp that the operator already allowlisted. This contract can spend ONLY
 * its own balance. It has no path to a user's SmartAccount, no pause that
 * freezes user funds, and no hardcoded platform address.
 *
 * Funding the float is Nitro Class X (ADR 2026-08-08). Until ETH sits here,
 * every validation returns failure — same refuse as the TypeScript policy's
 * `funding_unconfigured`. An empty paymaster is not a pretend sponsor.
 *
 * The operator key can widen/narrow the allowlist and withdraw leftover float.
 * That key cannot move a user's tokens. Killing sponsorship does not kill
 * the user's account: they still submit with their own gas.
 */
contract ScopedPaymaster is IPaymaster {
    uint256 private constant SIG_VALIDATION_FAILED = 1;
    uint256 private constant SIG_VALIDATION_SUCCESS = 0;

    address public immutable entryPoint;
    address public immutable operator;

    mapping(address => bool) public allowlisted;
    mapping(bytes4 => bool) public permittedSelector;
    uint256 public maxCostWei;

    error EntryPointRequired();
    error OperatorRequired();
    error NotEntryPoint();
    error NotOperator();
    error BadCap();

    event AllowlistSet(address indexed sender, bool allowed);
    event SelectorSet(bytes4 indexed selector, bool permitted);
    event MaxCostSet(uint256 maxCostWei);
    event FloatWithdrawn(address indexed to, uint256 amount);

    constructor(address entryPoint_, address operator_) {
        if (entryPoint_ == address(0)) revert EntryPointRequired();
        if (operator_ == address(0)) revert OperatorRequired();
        entryPoint = entryPoint_;
        operator = operator_;
    }

    receive() external payable {}

    function setAllowlisted(address sender, bool allowed) external {
        if (msg.sender != operator) revert NotOperator();
        if (sender == address(0)) revert OperatorRequired();
        allowlisted[sender] = allowed;
        emit AllowlistSet(sender, allowed);
    }

    function setSelector(bytes4 selector, bool permitted) external {
        if (msg.sender != operator) revert NotOperator();
        if (selector == bytes4(0)) revert BadCap();
        permittedSelector[selector] = permitted;
        emit SelectorSet(selector, permitted);
    }

    function setMaxCostWei(uint256 maxCostWei_) external {
        if (msg.sender != operator) revert NotOperator();
        maxCostWei = maxCostWei_;
        emit MaxCostSet(maxCostWei_);
    }

    /** Operator recovers unused float. Cannot touch a user's account. */
    function withdrawFloat(address to, uint256 amount) external {
        if (msg.sender != operator) revert NotOperator();
        if (to == address(0) || amount == 0) revert BadCap();
        (bool ok, ) = payable(to).call{value: amount}("");
        if (!ok) revert BadCap();
        emit FloatWithdrawn(to, amount);
    }

    function validatePaymasterUserOp(
        PackedUserOperation calldata userOp,
        bytes32 /* userOpHash */,
        uint256 maxCost
    ) external view override returns (bytes memory context, uint256 validationData) {
        if (msg.sender != entryPoint) revert NotEntryPoint();

        // Empty float = Nitro has not funded. Refuse, do not pretend.
        if (address(this).balance == 0 || maxCost > address(this).balance) {
            return ("", SIG_VALIDATION_FAILED);
        }
        if (maxCostWei == 0 || maxCost > maxCostWei) {
            return ("", SIG_VALIDATION_FAILED);
        }
        if (!allowlisted[userOp.sender]) {
            return ("", SIG_VALIDATION_FAILED);
        }
        if (userOp.callData.length < 4) {
            return ("", SIG_VALIDATION_FAILED);
        }
        bytes4 selector = bytes4(userOp.callData[0:4]);
        if (!permittedSelector[selector]) {
            return ("", SIG_VALIDATION_FAILED);
        }
        context = "";
        validationData = SIG_VALIDATION_SUCCESS;
    }

    function postOp(PostOpMode, bytes calldata, uint256, uint256) external override {
        if (msg.sender != entryPoint) revert NotEntryPoint();
    }
}
