# TRK-ops.analytics — research / spec pack

**Tracker id:** `ops.analytics`  
**Title:** Warehouse — read replica + cube layer  
**Module / phase:** `core-ops` · phase 5  
**Status on tip:** `ready` · **owner:** none  
**Depends on:** `ledger.double-entry`  
**Tip freeze:** `origin/main` @ `c6d9e89e` (re-derive before implement)  
**Pack type:** research only — no implement swarm; no money invention; no dual-edit of Denon open money PRs; no `features.mjs` edit.

---

## 1 · What “done” means (plain language)

1. Ops can answer historical aggregates (volume, users, fees) without ad-hoc OLTP dumps as BI.
2. Path is **read replica / warehouse + cube** (or equal metrics layer) — not a second ledger.
3. Money figures derive from ledger-posted truth (or are labeled provisional).
4. Staff-scoped access only.

## 2 · Current code state (tip `c6d9e89e`)

| Area                          | Reality                                               |
| ----------------------------- | ----------------------------------------------------- |
| Analytics / warehouse service | **None**                                              |
| Cube/dbt in monorepo          | **None**                                              |
| Money SoT                     | `services/svc-ledger` OLTP                            |
| `svc-indexer`                 | Chain → protocol read models — **not** fiat warehouse |
| `apps/admin`                  | Control plane, not BI warehouse                       |

## 3 · Doctrine constraints

| Law           | Implication                                           |
| ------------- | ----------------------------------------------------- |
| §0.6          | Warehouse never posts or holds spendable balances     |
| Dual-book     | Dashboard money must not silently diverge from ledger |
| PII / Class X | Query rights, retention, residency                    |

## 4 · DoD sketch (staged)

### Stage 1

- [ ] Tech choice recorded (managed WH vs PG replica + views)
- [ ] Allowed source tables documented
- [ ] Read-only reporting role; BI cannot write OLTP

### Stage 2

- [ ] 3–5 certified metrics with tests + freshness SLO

**Tracker `done`:** Stage 2 trusted in ops — not an empty cube skeleton.

## 5 · Open questions

1. Warehouse vendor/tech.
2. Metric ownership (ops vs data vs product).
3. Cross-border export.

## 6 · Estimated size

Replica plumbing **M–L** infra; first metrics **M**; full cube **XL**.

**First PR:** replica config + one certified view — **S–M**, no fake dashboards.

## 7 · Related

- `services/svc-ledger`, `packages/ledger-client`
- Dual-book CI gates

## 8 · Non-goals

- No second balance engine in BI.
- No invented fee income.
