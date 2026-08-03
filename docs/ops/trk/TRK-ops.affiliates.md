# TRK-ops.affiliates — research / spec pack

**Tracker id:** `ops.affiliates`  
**Title:** Multi-tier affiliate / IB trees, payout automation  
**Module / phase:** `core-ops` · phase 5  
**Status on tip:** `ready` · **owner:** none  
**Depends on:** `ledger.double-entry`  
**Tip freeze:** `origin/main` @ `c6d9e89e` (re-derive before implement)  
**Pack type:** research only — no implement swarm; no money invention; no dual-edit of Denon open money PRs; no `features.mjs` edit.

---

## 1 · What “done” means (plain language)

1. Multi-tier referrer/IB **tree** with clear attribution.
2. Scheduled payouts via **ledger recipes** only — affiliate module holds no balances.
3. Operators inspect tree, freeze nodes, recompute owed from events.
4. Rates are product law/config; copy stays brand-clean.

## 2 · Current code state (tip `c6d9e89e`)

| Area               | Reality                                                                 |
| ------------------ | ----------------------------------------------------------------------- |
| Affiliate service  | **None**                                                                |
| Commission recipes | Re-grep `packages/ledger-client` before implement — not assumed present |
| Money risk         | **Class M** for payout automation                                       |

## 3 · Doctrine constraints

| Law         | Implication                                |
| ----------- | ------------------------------------------ |
| §0.6        | No affiliate-held balances                 |
| Money types | Decimal strings / bigint — never `number`  |
| Class M     | Self-audit + adversarial pass before merge |
| Fail closed | Ambiguous attribution → no auto-payout     |

## 4 · DoD sketch (staged)

### Stage 1 — attribution only

- [ ] Contracts: attach, tree read, attributed-event projection
- [ ] Cycle/reparent tests

### Stage 2 — payouts

- [ ] Commission recipe(s) + idempotent job
- [ ] Dry-run → commit; freeze + clawback recipes

**Tracker `done`:** Stage 2 dual-book green in staging.

## 5 · Open questions

1. Who sets commission schedules.
2. Overlap with `academy.ambassadors` pay (no double-pay).
3. Tax reporting.

## 6 · Estimated size

Attribution **M** Class N/P; payouts **L** Class M.

**First PR:** attribution without money — **M**.

## 7 · Related

- `packages/ledger-client` recipes
- `academy.ambassadors`

## 8 · Non-goals

- No silent ledger credits.
- No shadow affiliate wallets.
