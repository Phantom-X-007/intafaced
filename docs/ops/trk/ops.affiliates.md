# TRK-ops.affiliates

**Title:** Multi-tier affiliate / IB trees, payout automation  
**Tracker:** `ops.affiliates` · module `core-ops` · phase 5 · status `ready` · owner none  
**Depends on:** `ledger.double-entry`  
**Tip freeze:** `origin/main` @ `04f9b1f2` (re-derive before implement)  
**Pack type:** thorough research upgrade (`docs/trk-research-pack-drain`) — no implement swarm; no money invention; no dual-edit Denon open money PRs; no `features.mjs` edit.

---

## 1 · What “done” means (plain language)

Multi-tier referrer/IB tree with clear attribution. Scheduled payouts via ledger recipes only. Operators inspect/freeze/recompute. Rates = product law.

## 2 · Current code state (tip `04f9b1f2`)

| Area               | Reality                                           |
| ------------------ | ------------------------------------------------- |
| Affiliate service  | **None**                                          |
| Commission recipes | Re-grep `packages/ledger-client` before implement |
| Money risk         | **Class M** for payout automation                 |

## 3 · Doctrine constraints

| Law         | Implication                                |
| ----------- | ------------------------------------------ |
| §0.6        | No affiliate-held balances                 |
| Money types | Decimal strings / bigint — never `number`  |
| Class M     | Self-audit + adversarial pass before merge |
| Fail closed | Ambiguous attribution → no auto-payout     |

## 4 · DoD sketch (checkable — staged)

### Stage 1 — attribution only

- [ ] Contracts: attach, tree read, attributed-event projection
- [ ] Cycle/reparent tests

### Stage 2 — payouts

- [ ] Commission recipe(s) + idempotent job
- [ ] Dry-run → commit; freeze + clawback recipes

### Tracker `done` bar

Flip only when the title’s product promise is true in a real env — not when a stub route or empty skeleton merges.

## 5 · Open questions

1. Who sets commission schedules.
2. Overlap with academy.ambassadors pay (no double-pay).
3. Tax reporting.

## 6 · Estimated size

| Slice             | Size            |
| ----------------- | --------------- |
| Attribution tree  | **M** Class N/P |
| Payout automation | **L** Class M   |

## 7 · Related docs / code

- `packages/ledger-client` recipes
- `academy.ambassadors`

## 8 · Explicit non-goals for this pack

- No silent ledger credits.
- No shadow affiliate wallets.
