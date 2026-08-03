# TRK-ops.analytics

**Title:** Warehouse — read replica + cube layer  
**Tracker:** `ops.analytics` · module `core-ops` · phase 5 · status `ready` · owner none  
**Depends on:** `ledger.double-entry`  
**Tip freeze:** `origin/main` @ `04f9b1f2` (re-derive before implement)  
**Pack type:** thorough research upgrade (`docs/trk-research-pack-drain`) — no implement swarm; no money invention; no dual-edit Denon open money PRs; no `features.mjs` edit.

---

## 1 · What “done” means (plain language)

Ops/product answer historical aggregates without ad-hoc OLTP BI dumps. Read replica/warehouse + cube — not a second ledger. Money from ledger truth or labeled provisional. Staff-scoped.

## 2 · Current code state (tip `04f9b1f2`)

| Area                          | Reality                                               |
| ----------------------------- | ----------------------------------------------------- |
| Warehouse / analytics service | **None**                                              |
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

## 4 · DoD sketch (checkable — staged)

### Stage 1

- [ ] Tech choice recorded (managed WH vs PG replica + views)
- [ ] Allowed source tables documented
- [ ] Read-only reporting role; BI cannot write OLTP

### Stage 2

- [ ] 3–5 certified metrics with tests + freshness SLO

### Tracker `done` bar

Flip only when the title’s product promise is true in a real env — not when a stub route or empty skeleton merges.

## 5 · Open questions

1. Warehouse vendor/tech.
2. Metric ownership.
3. Cross-border export.

## 6 · Estimated size

| Slice                  | Size          |
| ---------------------- | ------------- |
| Replica plumbing       | **M–L** infra |
| First metrics pack     | **M**         |
| Full multi-domain cube | **XL**        |

## 7 · Related docs / code

- `services/svc-ledger`
- `packages/ledger-client`
- Dual-book CI gates

## 8 · Explicit non-goals for this pack

- No second balance engine in BI.
- No invented fee income.
