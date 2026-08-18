// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20Minimal} from "../amm/IERC20Minimal.sol";

interface IERC721Escrow {
    function transferFrom(address from, address to, uint256 tokenId) external;
}

interface IERC2981Royalty {
    function royaltyInfo(uint256 tokenId, uint256 salePrice) external view returns (address receiver, uint256 royaltyAmount);
}

/**
 * ROYALTY MARKET — Protocol Plane (board S-G3 / `launch.nft`).
 *
 * Fixed-price list and a one-lot English auction. The NFT is escrowed here.
 * The buyer (or highest bidder) pays a quote ERC-20; this contract pays the
 * ERC-2981 royalty to the receiver and the remainder to the seller, then
 * transfers the NFT. That split is not optional and is not honour-system.
 *
 * No platform fee. No owner. NOT AUDITED.
 */
contract RoyaltyMarket {
    struct Listing {
        address seller;
        address nft;
        uint256 tokenId;
        address quote;
        uint256 price;
        bool active;
    }

    struct Auction {
        address seller;
        address nft;
        uint256 tokenId;
        address quote;
        uint256 minBid;
        uint64 endTime;
        address highestBidder;
        uint256 highestBid;
        bool settled;
    }

    uint256 public nextListingId = 1;
    mapping(uint256 => Listing) public listings;

    uint256 public nextAuctionId = 1;
    mapping(uint256 => Auction) public auctions;

    event Listed(uint256 indexed id, address indexed seller, address indexed nft, uint256 tokenId, address quote, uint256 price);
    event Cancelled(uint256 indexed id);
    event Sold(uint256 indexed id, address indexed buyer, uint256 price, uint256 royalty, address royaltyReceiver);
    event AuctionStarted(
        uint256 indexed id,
        address indexed seller,
        address indexed nft,
        uint256 tokenId,
        address quote,
        uint256 minBid,
        uint64 endTime
    );
    event BidPlaced(uint256 indexed id, address indexed bidder, uint256 amount);
    event AuctionSettled(uint256 indexed id, address indexed winner, uint256 price, uint256 royalty, address royaltyReceiver);

    error BadParams();
    error Inactive();
    error NotSeller();
    error PaymentTooLow();
    error TransferFailed();
    error AuctionLive();
    error AuctionOver();
    error BidTooLow();

    function list(address nft, uint256 tokenId, address quote, uint256 price) external returns (uint256 id) {
        if (nft == address(0) || quote == address(0) || price == 0) revert BadParams();
        IERC721Escrow(nft).transferFrom(msg.sender, address(this), tokenId);
        id = nextListingId;
        nextListingId = id + 1;
        listings[id] = Listing(msg.sender, nft, tokenId, quote, price, true);
        emit Listed(id, msg.sender, nft, tokenId, quote, price);
    }

    function cancel(uint256 listingId) external {
        Listing storage L = listings[listingId];
        if (!L.active) revert Inactive();
        if (L.seller != msg.sender) revert NotSeller();
        L.active = false;
        IERC721Escrow(L.nft).transferFrom(address(this), L.seller, L.tokenId);
        emit Cancelled(listingId);
    }

    function buy(uint256 listingId) external {
        Listing storage L = listings[listingId];
        if (!L.active) revert Inactive();
        L.active = false;
        (uint256 royalty, address receiver) = _takePayment(L.nft, L.tokenId, L.quote, L.price, L.seller, msg.sender);
        IERC721Escrow(L.nft).transferFrom(address(this), msg.sender, L.tokenId);
        emit Sold(listingId, msg.sender, L.price, royalty, receiver);
    }

    function startAuction(
        address nft,
        uint256 tokenId,
        address quote,
        uint256 minBid,
        uint32 duration
    ) external returns (uint256 id) {
        if (nft == address(0) || quote == address(0) || duration == 0) revert BadParams();
        IERC721Escrow(nft).transferFrom(msg.sender, address(this), tokenId);
        id = nextAuctionId;
        nextAuctionId = id + 1;
        uint64 endTime = uint64(block.timestamp) + duration;
        auctions[id] = Auction(msg.sender, nft, tokenId, quote, minBid, endTime, address(0), 0, false);
        emit AuctionStarted(id, msg.sender, nft, tokenId, quote, minBid, endTime);
    }

    function bid(uint256 auctionId, uint256 amount) external {
        Auction storage A = auctions[auctionId];
        if (A.settled || A.seller == address(0)) revert Inactive();
        if (block.timestamp >= A.endTime) revert AuctionOver();
        if (amount < A.minBid || amount <= A.highestBid) revert BidTooLow();
        if (!IERC20Minimal(A.quote).transferFrom(msg.sender, address(this), amount)) revert PaymentTooLow();
        address prev = A.highestBidder;
        uint256 prevBid = A.highestBid;
        A.highestBidder = msg.sender;
        A.highestBid = amount;
        if (prev != address(0)) {
            if (!IERC20Minimal(A.quote).transfer(prev, prevBid)) revert TransferFailed();
        }
        emit BidPlaced(auctionId, msg.sender, amount);
    }

    function endAuction(uint256 auctionId) external {
        Auction storage A = auctions[auctionId];
        if (A.settled || A.seller == address(0)) revert Inactive();
        if (block.timestamp < A.endTime) revert AuctionLive();
        A.settled = true;
        if (A.highestBidder == address(0)) {
            IERC721Escrow(A.nft).transferFrom(address(this), A.seller, A.tokenId);
            emit AuctionSettled(auctionId, address(0), 0, 0, address(0));
            return;
        }
        (uint256 royalty, address receiver) = _splitHeld(A.nft, A.tokenId, A.quote, A.highestBid, A.seller);
        IERC721Escrow(A.nft).transferFrom(address(this), A.highestBidder, A.tokenId);
        emit AuctionSettled(auctionId, A.highestBidder, A.highestBid, royalty, receiver);
    }

    /// @dev ERC-721 receiver hook so a seller may `safeTransferFrom` into escrow.
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return 0x150b7a02;
    }

    function _takePayment(
        address nft,
        uint256 tokenId,
        address quote,
        uint256 price,
        address seller,
        address payer
    ) private returns (uint256 royalty, address receiver) {
        if (!IERC20Minimal(quote).transferFrom(payer, address(this), price)) revert PaymentTooLow();
        return _splitHeld(nft, tokenId, quote, price, seller);
    }

    function _splitHeld(
        address nft,
        uint256 tokenId,
        address quote,
        uint256 price,
        address seller
    ) private returns (uint256 royalty, address receiver) {
        (receiver, royalty) = _royaltyOf(nft, tokenId, price);
        if (royalty > price) royalty = price;
        if (royalty == 0 || receiver == address(0)) {
            royalty = 0;
            receiver = address(0);
            if (!IERC20Minimal(quote).transfer(seller, price)) revert TransferFailed();
            return (0, address(0));
        }
        if (!IERC20Minimal(quote).transfer(receiver, royalty)) revert TransferFailed();
        if (!IERC20Minimal(quote).transfer(seller, price - royalty)) revert TransferFailed();
    }

    function _royaltyOf(address nft, uint256 tokenId, uint256 price) private view returns (address receiver, uint256 amount) {
        try IERC2981Royalty(nft).royaltyInfo(tokenId, price) returns (address r, uint256 a) {
            return (r, a);
        } catch {
            return (address(0), 0);
        }
    }
}
