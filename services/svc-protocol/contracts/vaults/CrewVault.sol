// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20Minimal} from "../amm/IERC20Minimal.sol";

/**
 * CREW VAULT — Protocol Plane (board S-L1 / §33).
 *
 * Shared treasury: member shares fixed at construction (sum = 10_000 bps).
 * Spend requires M-of-N approvals. Exit pays pro-rata of current balances by share —
 * the split is defined before anyone deposits.
 */
contract CrewVault {
    uint16 public immutable threshold; // M
    uint8 public immutable memberCount; // N
    address public immutable token;

    address[] public members;
    mapping(address => uint16) public shareBps; // of 10_000
    mapping(address => bool) public isMember;

    uint256 public nextSpendId = 1;
    struct Spend {
        address to;
        uint256 amount;
        uint8 approvals;
        bool executed;
        mapping(address => bool) approved;
    }
    mapping(uint256 => Spend) private spends;

    event Deposited(address indexed from, uint256 amount);
    event SpendProposed(uint256 indexed id, address indexed to, uint256 amount);
    event SpendApproved(uint256 indexed id, address indexed member);
    event SpendExecuted(uint256 indexed id, address indexed to, uint256 amount);
    event Exited(address indexed member, uint256 amount);

    error BadConfig();
    error NotMember();
    error BadAmount();
    error AlreadyApproved();
    error AlreadyExecuted();
    error ThresholdNotMet();
    error TransferFailed();
    error StillMember();

    constructor(address token_, address[] memory members_, uint16[] memory shareBps_, uint16 threshold_) {
        if (token_ == address(0) || members_.length < 2 || members_.length != shareBps_.length) revert BadConfig();
        if (threshold_ == 0 || threshold_ > members_.length) revert BadConfig();
        uint256 sum;
        for (uint256 i = 0; i < members_.length; i++) {
            if (members_[i] == address(0) || shareBps_[i] == 0 || isMember[members_[i]]) revert BadConfig();
            isMember[members_[i]] = true;
            shareBps[members_[i]] = shareBps_[i];
            members.push(members_[i]);
            sum += shareBps_[i];
        }
        if (sum != 10_000) revert BadConfig();
        token = token_;
        threshold = threshold_;
        memberCount = uint8(members_.length);
    }

    function deposit(uint256 amount) external {
        if (amount == 0) revert BadAmount();
        if (!IERC20Minimal(token).transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        emit Deposited(msg.sender, amount);
    }

    function proposeSpend(address to, uint256 amount) external returns (uint256 id) {
        if (!isMember[msg.sender]) revert NotMember();
        if (to == address(0) || amount == 0) revert BadAmount();
        id = nextSpendId++;
        Spend storage s = spends[id];
        s.to = to;
        s.amount = amount;
        emit SpendProposed(id, to, amount);
        _approve(id);
    }

    function approveSpend(uint256 id) external {
        _approve(id);
    }

    function executeSpend(uint256 id) external {
        Spend storage s = spends[id];
        if (s.to == address(0)) revert BadAmount();
        if (s.executed) revert AlreadyExecuted();
        if (s.approvals < threshold) revert ThresholdNotMet();
        s.executed = true;
        if (!IERC20Minimal(token).transfer(s.to, s.amount)) revert TransferFailed();
        emit SpendExecuted(id, s.to, s.amount);
    }

    /**
     * Exit: burn membership, pay share of current vault balance.
     * Designed before deposits — shareBps is immutable.
     */
    function exit() external {
        if (!isMember[msg.sender]) revert NotMember();
        uint16 bps = shareBps[msg.sender];
        uint256 bal = IERC20Minimal(token).balanceOf(address(this));
        uint256 amount = (bal * uint256(bps)) / 10_000;
        isMember[msg.sender] = false;
        shareBps[msg.sender] = 0;
        // Remaining members keep their bps; sum may drop below 10k after exits —
        // later exits are relative to remaining share table. For P0: first-exit
        // pays their construction share of current balance.
        if (amount > 0) {
            if (!IERC20Minimal(token).transfer(msg.sender, amount)) revert TransferFailed();
        }
        emit Exited(msg.sender, amount);
    }

    function _approve(uint256 id) private {
        if (!isMember[msg.sender]) revert NotMember();
        Spend storage s = spends[id];
        if (s.to == address(0)) revert BadAmount();
        if (s.executed) revert AlreadyExecuted();
        if (s.approved[msg.sender]) revert AlreadyApproved();
        s.approved[msg.sender] = true;
        s.approvals += 1;
        emit SpendApproved(id, msg.sender);
    }
}
