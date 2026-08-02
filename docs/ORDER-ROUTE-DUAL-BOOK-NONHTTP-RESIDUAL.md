# Dual-book residual — classified setBalance (after #289)

**Generated:** 2026-08-02 · `pnpm dual-book:classify` (or `node tooling/scripts/dual-book-setbalance-classify.mjs`)  
**Brand-safe paths** use `vendor/<exchange>/…` in prose.

## Summary

| Kind                       | Count        | Meaning                                                             |
| -------------------------- | ------------ | ------------------------------------------------------------------- |
| **LIVE**                   | **10**       | Real H-OR-JAVA candidates (non-HTTP, not behind dual-book throw)    |
| **HTTP_DOOR**              | **14**       | Controllers — must stay listed in DualBookMoneyDoorInterceptor      |
| **DEAD_NULL / DEAD_THROW** | (classifier) | Already short-circuited by #289 dual-book work — **not** open holes |

Earlier “23 live” inventory mixed dead service bodies with true residual. **Do not re-open dead sites.**

## LIVE (H-OR-JAVA / M7 — HUMAN-CLAIMED @shehzad002)

Agents **must not** implement these under Board Clear (`LIVE-LANES` H-OR-JAVA). Owner: shehzad.

| File (brand-safe)                        |         Line | Snippet                                      |
| ---------------------------------------- | -----------: | -------------------------------------------- |
| `…/admin/…/ForkJoin/ForkJoinWork.java`   |        86–87 | wallet zero init setBalance/setFrozenBalance |
| `…/core/…/MemberApplicationService.java` |     194, 243 | promotion path setBalance                    |
| `…/otc-api/…/event/OrderEvent.java`      |           71 | promotion setBalance                         |
| `…/wallet/…/CoinConsumer.java`           |        89–90 | wallet create zeros                          |
| `…/wallet/…/MemberConsumer.java`         | 108–109, 149 | wallet create zeros + reward credit          |

**Recommended M7 approach:** entry-point throws / job disable (same PEACE pattern as MemberWalletService), then re-run classify until LIVE=0; keep HTTP_DOOR under interceptor inventory.

## HTTP_DOOR (agent-maintained path list)

Covered by `DualBookMoneyDoorInterceptor` + `pnpm scan:dual-book-door` + `pnpm scan:dual-book-door-paths`.  
If a controller mutator is added without a fragment, path unit / inventory must fail closed.

## Already sealed (do not list as open)

Service entry throws on: LegalWallet\* · MemberWalletService mutators · MemberService.signIn · MemberTransactionService.matchWallet · WithdrawRecordService audit/success/fail · promotion null short-circuits · MiningsJob disabled.

## Not go-live

Classify + door scans ≠ production Java boot proof. Full JVM 410 smoke remains ops residual.
