// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * SOVEREIGN NFT — Protocol Plane (board S-G3 / `launch.nft`).
 *
 * Minimal ERC-721 written in-repo (no OpenZeppelin). Mint is permissionless:
 * `mint(recipient)` credits `msg.sender` when `recipient` is zero.
 *
 * Royalties are ERC-2981 *and* the listing contract actually pays them
 * (`RoyaltyMarket`). Signalling without a sale path that splits is theatre.
 *
 * Token owner may `setTokenRoyalty` up to `MAX_ROYALTY_BPS` (10%). There is
 * no collection owner, no pause, no platform key. NOT AUDITED.
 */
contract SovereignNft {
    string public name;
    string public symbol;
    uint256 public nextId = 1;

    uint16 public constant MAX_ROYALTY_BPS = 1_000; // 10% of 10_000

    mapping(uint256 => address) private _owner;
    mapping(address => uint256) private _balance;
    mapping(uint256 => address) private _tokenApproval;
    mapping(address => mapping(address => bool)) private _operator;

    mapping(uint256 => address) private _royaltyReceiver;
    mapping(uint256 => uint16) private _royaltyBps;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    event RoyaltySet(uint256 indexed tokenId, address indexed receiver, uint16 bps);

    error Nonexistent();
    error NotOwner();
    error NotApproved();
    error BadTo();
    error RoyaltyTooHigh();
    error BadRoyalty();
    error UnsafeReceiver();

    constructor(string memory name_, string memory symbol_) {
        name = name_;
        symbol = symbol_;
    }

    function mint(address recipient) external returns (uint256 tokenId) {
        address to = recipient == address(0) ? msg.sender : recipient;
        tokenId = nextId;
        nextId = tokenId + 1;
        _owner[tokenId] = to;
        _balance[to] += 1;
        emit Transfer(address(0), to, tokenId);
    }

    function setTokenRoyalty(uint256 tokenId, address receiver, uint16 bps) external {
        if (_owner[tokenId] != msg.sender) revert NotOwner();
        if (bps > MAX_ROYALTY_BPS) revert RoyaltyTooHigh();
        if (bps > 0 && receiver == address(0)) revert BadRoyalty();
        _royaltyReceiver[tokenId] = receiver;
        _royaltyBps[tokenId] = bps;
        emit RoyaltySet(tokenId, receiver, bps);
    }

    /// @notice ERC-2981. Amount is `salePrice * bps / 10_000`.
    function royaltyInfo(uint256 tokenId, uint256 salePrice) external view returns (address receiver, uint256 royaltyAmount) {
        if (_owner[tokenId] == address(0)) revert Nonexistent();
        receiver = _royaltyReceiver[tokenId];
        royaltyAmount = (salePrice * uint256(_royaltyBps[tokenId])) / 10_000;
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return
            interfaceId == 0x01ffc9a7 || // ERC-165
            interfaceId == 0x80ac58cd || // ERC-721
            interfaceId == 0x2a55205a; // ERC-2981
    }

    function balanceOf(address owner_) external view returns (uint256) {
        if (owner_ == address(0)) revert BadTo();
        return _balance[owner_];
    }

    function ownerOf(uint256 tokenId) external view returns (address) {
        address o = _owner[tokenId];
        if (o == address(0)) revert Nonexistent();
        return o;
    }

    function getApproved(uint256 tokenId) external view returns (address) {
        if (_owner[tokenId] == address(0)) revert Nonexistent();
        return _tokenApproval[tokenId];
    }

    function isApprovedForAll(address owner_, address operator) external view returns (bool) {
        return _operator[owner_][operator];
    }

    function approve(address to, uint256 tokenId) external {
        address o = _owner[tokenId];
        if (o == address(0)) revert Nonexistent();
        if (msg.sender != o && !_operator[o][msg.sender]) revert NotApproved();
        _tokenApproval[tokenId] = to;
        emit Approval(o, to, tokenId);
    }

    function setApprovalForAll(address operator, bool approved) external {
        _operator[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function transferFrom(address from, address to, uint256 tokenId) public {
        _transfer(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        _transfer(from, to, tokenId);
        _checkOnReceived(msg.sender, from, to, tokenId, "");
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes calldata data) external {
        _transfer(from, to, tokenId);
        _checkOnReceived(msg.sender, from, to, tokenId, data);
    }

    function _transfer(address from, address to, uint256 tokenId) private {
        if (to == address(0)) revert BadTo();
        address o = _owner[tokenId];
        if (o == address(0)) revert Nonexistent();
        if (o != from) revert NotOwner();
        if (msg.sender != o && msg.sender != _tokenApproval[tokenId] && !_operator[o][msg.sender]) revert NotApproved();
        _tokenApproval[tokenId] = address(0);
        _balance[from] -= 1;
        _balance[to] += 1;
        _owner[tokenId] = to;
        emit Transfer(from, to, tokenId);
    }

    function _checkOnReceived(address operator, address from, address to, uint256 tokenId, bytes memory data) private {
        if (to.code.length == 0) return;
        // solhint-disable-next-line avoid-low-level-calls
        (bool ok, bytes memory ret) = to.call(
            abi.encodeWithSelector(0x150b7a02, operator, from, tokenId, data)
        );
        if (!ok || ret.length != 32 || bytes4(ret) != 0x150b7a02) revert UnsafeReceiver();
    }
}
