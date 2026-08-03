# TRK-market.vendors

**Title:** Vendor lifecycle — apply, vet, list, stake-gated slots  
**Tracker:** `market.vendors` · module `market` · phase 5 · status `ready` · owner none  
**Depends on:** `token.staking`  
**Tip freeze:** `origin/main` @ `04f9b1f2` (re-derive before implement)  
**Pack type:** thorough research upgrade (`docs/trk-research-pack-drain`) — no implement swarm; no money invention; no dual-edit Denon open money PRs; no `features.mjs` edit.

---

## 1 · What “done” means (plain language)

Vendor apply/vet/list with stake-gated slots. Purchases never store balances in a market module.

## 2 · Current code state (tip `04f9b1f2`)

| Area                  | Reality                              |
| --------------------- | ------------------------------------ |
| `services/svc-market` | **Missing**                          |
| Staking dep           | `token.staking`                      |
| Money                 | Later commerce → ledger recipes only |

## 3 · Doctrine constraints

| Law          | Implication             |
| ------------ | ----------------------- |
| §0.6         | No market-held balances |
| Stake proofs | Via token service       |
| Class M      | If money later          |

## 4 · DoD sketch (checkable — staged)

### Stage 1 vendors

- [ ] Contracts: apply, vet, list, stake proof
- [ ] Service home + admin vet queue

### Tracker `done` bar

Flip only when the title’s product promise is true in a real env — not when a stub route or empty skeleton merges.

## 5 · Open questions

1. What is sold (bots, signals, content)?
2. Chargeback/dispute owner for later commerce.

## 6 · Estimated size

| Slice                         | Size  |
| ----------------------------- | ----- |
| Vendor state machine no money | **M** |
| Full vendor product           | **L** |

## 7 · Related docs / code

- `token.staking`
- ledger-client

## 8 · Explicit non-goals for this pack

- No inventing product catalog.
- No commission without recipes (commerce).
