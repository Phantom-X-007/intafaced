# Residual pack — M226-01 MemoryBroadcastStore

**Severity:** P0 multi-replica / P1 single-process crash window  
**Status 2026-07-31:** **OWNED BY OPEN PR #266** `feat(pay): durable Postgres crypto broadcast journal`  
**This finish fire:** do **not** implement competing store. Disposition: babysit #266 to green; re-verify M226-01 after merge.

## Law

Outbound Class M claim→send→put must survive process death and multi-replica.

## Gap

In-process `MemoryBroadcastStore` only (pre-#266).

## DoD when closed

- Durable journal migration + tests
- posture injects durable store in prod posture
- multi-replica claim atomic
- PEACE residual M226-01 HOLDS or CLOSED with tip SHA

## Collision

#266 files: broadcast-store, posture, drizzle 0004 — exclusive.
