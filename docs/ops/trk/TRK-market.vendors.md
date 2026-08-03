# TRK-market.vendors — research / spec pack

**Tracker id:** `market.vendors`  
**Title:** Vendor lifecycle — apply, vet, list, stake-gated slots  
**Module / phase:** `market` · phase 5  
**Status on tip:** `ready` · **owner:** none  
**Depends on:** `token.staking`  
**Tip freeze:** `origin/main` @ `c6d9e89e` (re-derive before implement)  
**Pack type:** research only — no implement swarm; no money invention; no dual-edit of Denon open money PRs; no `features.mjs` edit.

---

## 1 · What “done” means (plain language)

Vendor apply/vet/list with stake-gated slots. Purchases never store balances in a market module.

## 2 · Current code state (tip `c6d9e89e`)

| Area                  | Reality                                    |
| --------------------- | ------------------------------------------ |
| `services/svc-market` | **Missing**                                |
| Staking dep           | `token.staking`                            |
| Money                 | Purchases/commission → ledger recipes only |

## 3 · Doctrine constraints

| Law          | Implication                                  |
| ------------ | -------------------------------------------- |
| §0.6         | No market-held balances                      |
| Stake proofs | Via token service — not fantasy double books |
| Class M      | Purchase/commission paths                    |

## 4 · DoD sketch

### Stage 1 vendors

- [ ] Contracts: apply, vet, list, stake proof
- [ ] Service home + admin vet queue

### Stage 2 commerce

- [ ] Listings + subscriptions + purchase + commission recipes + tests

## 5 · Open questions

1. What is sold (bots, signals, content)?
2. Chargeback/dispute owner.

## 6 · Estimated size

Vendors **L**; commerce **L**. First PR: vendor state machine no money — **M**.

## 7 · Related

- `token.staking`, ledger-client

## 8 · Non-goals

- No inventing product catalog.
- No commission without recipes.
