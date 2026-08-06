# Dual-book residual — classified setBalance (post deep-audit finish)

**Generated:** 2026-08-02 · `node tooling/scripts/dual-book-setbalance-classify.mjs`  
**Brand-safe paths** use `vendor/<exchange>/…` in prose.

## Summary (re-derived this turn)

| Kind                    | Count | Meaning                                                    |
| ----------------------- | ----: | ---------------------------------------------------------- |
| **LIVE**                | **0** | Non-HTTP money mints                                       |
| **WALLET_INIT_ZERO**    |     6 | Register zeros — not value mint                            |
| **DEAD_NULL**           |     8 | Behind dual-book null / early-return                       |
| **HTTP_DOOR_COVERED**   |    13 | Controllers — door fragment likely listed (incl. dividend) |
| **HTTP_DOOR_UNCOVERED** | **0** | Would need door list or M7                                 |
| **RECORD_NOT_WALLET**   |     1 | HotTransferRecord log field — not MemberWallet             |

## Remaining (honest)

| Item                                                       | Owner        |
| ---------------------------------------------------------- | ------------ |
| Entity `MemberWalletService.save` still can write balances | M7 shehzad   |
| JVM live 410 smoke                                         | Ops / Docker |
| Human X                                                    | Nitro        |

## Not go-live

Classify LIVE=0 + door scans ≠ production Java boot proof.
