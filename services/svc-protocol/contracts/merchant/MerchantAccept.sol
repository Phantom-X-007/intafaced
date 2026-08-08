// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20Minimal} from "../amm/IERC20Minimal.sol";

/**
 * MERCHANT ACCEPT — Protocol Plane (board S-A6 / `protocol.merchant` / §24).
 *
 * Merchant-owned. Deployed to (or controlled by) THEIR smart account.
 * Platform address is never hardcoded. Optional fee recipients are merchant-chosen
 * at construction — if the merchant wants zero platform cut, they set none.
 *
 * Flow of funds: payer → this contract → merchant + optional splits in one tx.
 * The platform is not in the path unless the merchant explicitly lists it.
 */
contract MerchantAccept {
    address public immutable merchant;
    address public immutable feeRecipient; // address(0) = no fee
    uint16 public immutable feeBps;

    event Paid(
        address indexed payer,
        address indexed token,
        uint256 amount,
        uint256 toMerchant,
        uint256 toFee,
        bytes32 indexed invoiceId
    );

    error BadConfig();
    error BadAmount();
    error TransferFailed();
    error NotMerchant();

    constructor(address merchant_, address feeRecipient_, uint16 feeBps_) {
        if (merchant_ == address(0)) revert BadConfig();
        if (feeBps_ > 10_000) revert BadConfig();
        if (feeBps_ > 0 && feeRecipient_ == address(0)) revert BadConfig();
        if (feeBps_ == 0 && feeRecipient_ != address(0)) revert BadConfig();
        merchant = merchant_;
        feeRecipient = feeRecipient_;
        feeBps = feeBps_;
    }

    /**
     * Payer approves this contract, then pays. Invoice id is opaque metadata for the merchant.
     */
    function pay(address token, uint256 amount, bytes32 invoiceId) external {
        if (token == address(0) || amount == 0) revert BadAmount();
        if (!IERC20Minimal(token).transferFrom(msg.sender, address(this), amount)) revert TransferFailed();

        uint256 fee = (amount * uint256(feeBps)) / 10_000;
        uint256 toMerchant = amount - fee;
        if (fee > 0) {
            if (!IERC20Minimal(token).transfer(feeRecipient, fee)) revert TransferFailed();
        }
        if (!IERC20Minimal(token).transfer(merchant, toMerchant)) revert TransferFailed();
        emit Paid(msg.sender, token, amount, toMerchant, fee, invoiceId);
    }

    /** Rescue stray tokens accidentally sent without `pay` — merchant only. */
    function rescue(address token, uint256 amount) external {
        if (msg.sender != merchant) revert NotMerchant();
        if (!IERC20Minimal(token).transfer(merchant, amount)) revert TransferFailed();
    }
}
