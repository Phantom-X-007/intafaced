# TRK-launch.nft

**Title:** NFT mint / list / auction, on-chain royalties  
**Tracker:** `launch.nft` · module `launch` · phase 5 · status `ready` · owner none  
**Depends on:** `launch.token-factory`  
**Tip freeze:** `origin/main` @ `04f9b1f2` (re-derive before implement)  
**Pack type:** thorough research upgrade (`docs/trk-research-pack-drain`) — no implement swarm; no money invention; no dual-edit Denon open money PRs; no `features.mjs` edit.

---

## 1 · What “done” means (plain language)

NFT mint/list/auction with on-chain royalties. Greenfield relative to token factory.

## 2 · Current code state (tip `04f9b1f2`)

| Area          | Reality                    |
| ------------- | -------------------------- |
| NFT product   | **Not complete** as titled |
| Token factory | Partial base               |

## 3 · Doctrine constraints

| Law                   | Implication               |
| --------------------- | ------------------------- |
| Custody/royalty model | Explicit + honest         |
| Audits                | If user funds at risk     |
| Ownership             | May be protocol hard lane |

## 4 · DoD sketch (checkable — staged)

### DoD checks

- [ ] ADR: standard (721/1155), royalty path, marketplace scope
- [ ] Contracts + tests
- [ ] UI after refuse paths solid

### Tracker `done` bar

Flip only when the title’s product promise is true in a real env — not when a stub route or empty skeleton merges.

## 5 · Open questions

1. Marketplace vs mint-only v1.
2. Royalty enforcement path.

## 6 · Estimated size

| Slice          | Size     |
| -------------- | -------- |
| ADR + refusals | **S–M**  |
| Full product   | **L–XL** |

## 7 · Related docs / code

- launch.token-factory
- Shehzad boards

## 8 · Explicit non-goals for this pack

- No Shehzad implement from this pack.
