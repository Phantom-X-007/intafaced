# Dual-book residual — classified setBalance (post #359 + LIVE close)

**Generated:** 2026-08-02 · `node tooling/scripts/dual-book-setbalance-classify.mjs`  
**Brand-safe paths** use `vendor/<exchange>/…` in prose.

## Summary (re-derived this turn)

| Kind                 | Count | Meaning                                                                 |
| -------------------- | ----: | ----------------------------------------------------------------------- |
| **LIVE**             | **0** | Non-HTTP money mints — **closed** (promotion early-return + null short) |
| **WALLET_INIT_ZERO** |     6 | Wallet row create zeros on register/coin add — **not value mint**       |
| **DEAD_NULL**        |     8 | Behind dual-book null / early-return                                    |
| **HTTP_DOOR**        |    14 | Controllers — DualBookMoneyDoorInterceptor + path unit                  |

Earlier “10 LIVE mints” mixed **dead promotion bodies**, **null-short-circuited events**, and **wallet zero inits**. After this ship: **LIVE money-mint count = 0**.

## What closed this turn

- `MemberApplicationService.promotion` / `promotionLevelTwo` — **early return** (tree counters only; no wallet mint)
- Classifier honesty — DEAD_NULL / WALLET_INIT_ZERO / LIVE separation (80-line lookback)

## Remaining (honest, not fear)

| Item                                                 | Owner                                      | Why                                                                   |
| ---------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------- |
| HTTP_DOOR controller bodies still contain setBalance | Defense in depth: **door 410** + path unit | Optional M7 polish: throw at method entry if door ever mis-registered |
| WALLET_INIT_ZERO on member/coin register             | Shell scaffolding                          | Not a second **money** book; ledger remains SoT for value             |
| JVM live 410 smoke                                   | Ops / compose                              | Agent host often has no Docker                                        |
| Human X                                              | Nitro                                      | Secrets / go-live                                                     |

## Not go-live

Classify LIVE=0 + door scans ≠ production Java boot proof. **Not stable for real money.**
