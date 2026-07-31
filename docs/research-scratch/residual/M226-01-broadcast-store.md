# Residual pack — M226-01 broadcast journal

**Severity (updated):** multi-replica P0 **CLOSED on tip** · send→put crash window **P1 residual**  
**Tip re-check:** after #266 `b0d7b69` · re-verified residual-pay close 2026-07-31

## Re-verify (code on main)

| DoD                               | Evidence                                                                            |
| --------------------------------- | ----------------------------------------------------------------------------------- |
| Durable journal migration         | `services/svc-pay/drizzle/0004_pay_crypto_broadcasts.sql` — `pay.crypto_broadcasts` |
| PostgresBroadcastStore            | `broadcast-store.ts` — INSERT ON CONFLICT claim · put never overwrites settled hash |
| Live boot injects durable store   | `index.ts` — `new PostgresBroadcastStore(sql)` passed to `defaultChainFor`          |
| Multi-replica claim atomic        | unit tests fake SQL concurrent claimers; restart sim “rows stay”                    |
| Memory remains test/local default | `defaultChainFor` without store → MemoryBroadcastStore                              |

## Residual still open (honest, not multi-replica)

Crash **after** `eth_sendRawTransaction` **before** `put` can still double-send on retry (hash never journalled). Documented in svc-pay README. put-before-receipt closes wait-for-inclusion only.

**PEACE line:** multi-replica journal **CLOSED**; send→put window **P1** pilot residual.

## Collision

#266 merged. Do not re-implement a second store.
