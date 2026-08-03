# TRK-launch.nft

**Title:** NFT mint / list / auction, on-chain royalties  
**Tracker:** `launch.nft` · phase 5 · plane P · status `ready` · owner none  
**Depends on:** launch.token-factory (shared launch plane; NFT is separate template family)  
**Tip freeze:** `afa73a4f` · research only · no `features.mjs`

## DoD (plain language)

Creators can **mint** NFTs from platform templates, **list** and **auction** with **on-chain royalties** that actually pay — not off-chain honor-system only.

Platform does not custody NFT keys or sale proceeds outside ledger/contract design; unsigned calldata / SA patterns preferred.

Royalty accounting is enforceable on-chain (or explicitly limited with honest UX if marketplace enforces only).

## Path on tip

| Area      | Location                          |
| --------- | --------------------------------- |
| Contracts | **none**                          |
| Service   | **none**                          |
| Related   | svc-protocol launch (ERC-20 only) |

## Blocked by

| Blocker       | Notes                                              |
| ------------- | -------------------------------------------------- |
| Product law   | Royalty standard + marketplace scope               |
| Contracts     | None exist                                         |
| token-factory | Different template family — shared discipline only |

## First PR size (if free)

**S — standard + threat notes**; mint contracts only after product pick.

**Solid spec:** [TRK-launch.nft.md](./TRK-launch.nft.md)
