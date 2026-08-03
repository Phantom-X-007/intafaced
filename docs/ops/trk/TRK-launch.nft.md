# TRK-launch.nft — research / spec pack

**Tracker id:** `launch.nft`  
**Title:** NFT mint / list / auction, on-chain royalties  
**Module / phase:** `launch` · phase 5  
**Status on tip:** `ready` · **owner:** none  
**Depends on:** `launch.token-factory`  
**Tip freeze:** `origin/main` @ `c6d9e89e` (re-derive before implement)  
**Pack type:** research only — no implement swarm; no money invention; no dual-edit of Denon open money PRs; no `features.mjs` edit.

---

## 1 · What “done” means (plain language)

Product complete for: NFT mint / list / auction, on-chain royalties.  
NFT stack greenfield relative to token factory.

## 2 · Current code state (tip `c6d9e89e`)

| Area               | Reality                                     |
| ------------------ | ------------------------------------------- |
| Token factory base | Partial — see `TRK-launch.token-factory.md` |
| This surface       | **Not complete** as titled                  |
| Protocol deps      | AMM/staking may be human hard lanes         |

## 3 · Doctrine constraints

| Law                   | Implication                                |
| --------------------- | ------------------------------------------ |
| No invent money/depth | Presale custody model must be explicit     |
| Audits                | “Safe launch” copy requires honest risk    |
| Ownership             | Protocol implement often Shehzad — babysit |

## 4 · DoD sketch

- [ ] ADR: custody, fee, vesting
- [ ] Contracts + tests on dev chain
- [ ] Audit if user funds at risk
- [ ] UI only after refuse paths solid

## 5 · Open questions

1. Fiat vs pure on-chain presale custody.
2. LP ownership / rug disclosure.

## 6 · Estimated size

**L–XL** each. First PR: ADR + refusals — **S–M**.

## 7 · Related

- `TRK-launch.token-factory.md`, `protocol.amm`, `token.staking`, Shehzad boards

## 8 · Non-goals

- No Shehzad implement from this pack.
- No unaudited “safe” marketing.
