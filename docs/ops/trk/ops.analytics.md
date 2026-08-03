# TRK-ops.analytics

**Title:** Warehouse — read replica + cube layer  
**Tracker:** `ops.analytics` · phase 5 · plane F · status `ready` · owner none  
**Depends on:** `ledger.double-entry` (done)

## DoD (plain language)

Operators (and later product analytics surfaces) can answer volume, cohort, and
funnel questions from a **read-only warehouse** over ledger / domain events —
never by querying another service’s primary tables as if they were shared SQL.
Cube/metrics layer is explicit and reproducible. **Zero custody:** analytics
never holds balances or invents money columns.

## Path on tip

| Area              | Location                                                                  |
| ----------------- | ------------------------------------------------------------------------- |
| Doctrine home     | §8.8 / phase 5 — `svc-core-ops` analytics warehouse (not built)           |
| Service           | **No** `svc-analytics` / `svc-core-ops` warehouse package on tip          |
| Not this mountain | `svc-bank` **spend analytics** = per-user projection from ledger history  |
| Not this mountain | Operator “analytics read” via indexer/admin is Protocol-plane read models |
| Related           | `packages/events` bus is the intended feed; no cube consumer yet          |

Do **not** confuse bank `analytics.spend` (user money view) with the ops
warehouse mountain. Bank residual (ledger history port) is a separate spine.

## Blocked by

| Blocker            | Notes                                                            |
| ------------------ | ---------------------------------------------------------------- |
| Greenfield service | No warehouse schema, no read-replica wiring, no cube definitions |
| Product law        | Which metrics are day-one vs phase 5 stretch — Denon direction   |
| Data plane         | Replica / warehouse host + credentials = Class X ops, not craft  |
| Dual-edit          | Do not invent cross-service SQL; contracts/events first          |

Not Shehzad M1–M7. Not blocked by pay card sandbox.

## First PR size (if free)

**M — contracts + empty warehouse service:** declare metric catalog + event
consumers (or CDC contract) in `packages/contracts` / events; thin
`svc-analytics` (or `svc-core-ops` slice) that ingests one domain stream into
append-only fact tables and exposes one permissioned aggregate. No UI cube.
No primary-DB joins across service schemas. Proof: hermetic tests that refuse
write paths and money types as `number`.
