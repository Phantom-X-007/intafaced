// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * SOVEREIGN TOKEN — the launch template (§8.4 token factory, `launch.token-factory`).
 *
 * A fixed-supply ERC-20. The entire supply is minted once, in the constructor,
 * to an address named at deployment time. After that transaction there is no
 * privileged party anywhere in this contract.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT IS DELIBERATELY ABSENT — read this before adding anything
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * There is no `mint`. There is no `owner`, no `pause`, no `blacklist`, no
 * `setFee`, no upgrade path, no proxy, and no way to change `name`, `symbol`,
 * `decimals` or `totalSupply` after construction. That is not minimalism for
 * its own sake — every one of those is a rug vector, and §35 (Launch Trust
 * Layer) says the venue's whole claim is that a token launched here cannot be
 * rugged by the person who launched it.
 *
 * The consequence, stated plainly because it is a product decision and not an
 * oversight: a creator who wants to mint more later CANNOT, ever. They must
 * deploy a different token. A template that retains mint authority is a
 * separate product with a separate risk story, and it does not ship by
 * accident as a constructor flag on this one.
 *
 * ── Why the transfer surface is exactly the standard, and nothing more ──────
 *
 * Fee-on-transfer, reflection, rebasing and transfer hooks all break the
 * invariant that `balanceOf` after a transfer of `n` is `before + n`. Every
 * downstream consumer in this repo — the AMM's constant-product accounting,
 * the indexer's read models, any future bridge attestation — assumes that
 * invariant. A template that quietly violates it would corrupt them all, and
 * the corruption would look like a bug in the consumer.
 *
 * ── Provenance ──────────────────────────────────────────────────────────────
 *
 * Written out rather than imported from a library, for the same reason
 * `AccountFactory` vendors EIP-1167: every byte a user's token is built from is
 * in this repository, reviewable in one file, pinned by `sourceHash`.
 *
 * NOT AUDITED. `contracts/out/` is compiler output, not an audit report. §13
 * socket `socket.contract-toolchain` covers exactly this gap — there is a
 * compiler and a dev chain in this repo, and there is no fuzz suite, no gas
 * snapshot and no third-party review. "Audited templates" in the tracker is an
 * aspiration until that socket closes.
 */
contract SovereignToken {
    // ── Immutable identity ──────────────────────────────────────────────────
    //
    // `name` and `symbol` are `string`, so they cannot be `immutable` (Solidity
    // does not allow it for dynamic types). They are set once in the
    // constructor and no function in this contract writes to them again.

    string public name;
    string public symbol;

    /**
     * Fixed at deployment, bounded to 18 by the factory.
     *
     * The cap is not cosmetic. Anything this token is ever quoted or
     * reconciled against on the Fiat Plane lands in `numeric(38,18)`, and a
     * token with more than 18 decimals cannot round-trip through that without
     * silently losing its least significant digits.
     */
    uint8 public immutable decimals;

    /** Minted in full at construction. This number never changes. */
    uint256 public immutable totalSupply;

    /** The address that received the entire supply. Recorded for provenance. */
    address public immutable initialHolder;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    error SupplyRequired();
    error RecipientRequired();
    error TransferToZeroAddress();
    error ApproveToZeroAddress();
    error InsufficientBalance(address from, uint256 balance, uint256 needed);
    error InsufficientAllowance(address spender, uint256 allowed, uint256 needed);

    /**
     * Every argument here is part of the CREATE2 address the factory derives.
     * Changing any of them — including a single character of the name — is a
     * different token at a different address, by construction.
     */
    constructor(string memory name_, string memory symbol_, uint8 decimals_, uint256 totalSupply_, address recipient_) {
        if (totalSupply_ == 0) revert SupplyRequired();
        if (recipient_ == address(0)) revert RecipientRequired();

        name = name_;
        symbol = symbol_;
        decimals = decimals_;
        totalSupply = totalSupply_;
        initialHolder = recipient_;

        balanceOf[recipient_] = totalSupply_;

        // The mint, as ERC-20 defines it: a Transfer from the zero address. An
        // indexer that only watches Transfer sees the full supply appear, so
        // the sum of every Transfer it has ever seen reconciles to totalSupply.
        emit Transfer(address(0), recipient_, totalSupply_);
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        if (spender == address(0)) revert ApproveToZeroAddress();
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    /**
     * The caller spends an allowance the holder granted them.
     *
     * `type(uint256).max` is treated as an unlimited approval and is not
     * decremented — the near-universal convention, and the one every router and
     * pool in this space expects. Anything else is decremented exactly, so an
     * allowance is a budget rather than a permission.
     */
    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            if (allowed < value) revert InsufficientAllowance(msg.sender, allowed, value);
            unchecked {
                allowance[from][msg.sender] = allowed - value;
            }
        }
        _transfer(from, to, value);
        return true;
    }

    /**
     * Transfers to the zero address revert rather than burning.
     *
     * A burn that looks like a transfer is how supply goes missing by accident.
     * This template has no burn at all: to retire supply, send it to an address
     * nobody holds a key for, which is visible on chain as exactly what it is.
     */
    function _transfer(address from, address to, uint256 value) private {
        if (to == address(0)) revert TransferToZeroAddress();

        uint256 balance = balanceOf[from];
        if (balance < value) revert InsufficientBalance(from, balance, value);

        unchecked {
            // Both are safe: `value <= balance` was just checked, and the
            // credited side cannot exceed totalSupply, which is a uint256 the
            // debited side is part of.
            balanceOf[from] = balance - value;
            balanceOf[to] += value;
        }

        emit Transfer(from, to, value);
    }
}
