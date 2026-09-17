# Rebar coverage ledger — FINISHED hunt

Tip `origin/main` after #4263. Zero `UNHUNTED`.

| id    | status           | evidence                                                                                                    |
| ----- | ---------------- | ----------------------------------------------------------------------------------------------------------- |
| C-M1  | HUNTED           | #4263 `deposit-retry-id.test.ts`                                                                            |
| C-M2  | HUNTED           | #4263 `schedule-retry-id.test.ts`                                                                           |
| C-M3  | HUNTED           | Stage 1 rejected S2-3 occupancy                                                                             |
| C-M4  | HUNTED           | #4263 repay/propose + S2-4 addCollateral                                                                    |
| C-M5  | HUNTED           | S3-3 OTC quote rejected occupancy                                                                           |
| C-M6  | HUNTED           | #4262 `copy-service.test.ts`                                                                                |
| C-L1  | HUNTED           | #4261 `recipe-gate.test.ts`                                                                                 |
| C-L2  | HUNTED           | dual-book-scan tests                                                                                        |
| C-H1  | needs_validation | compose pin SEALED; operator must set `INTERNAL_SERVICE_BODY_BIND=require`; fingerprints :226/:197 rejected |
| C-A1  | HUNTED           | S8-1 JWT-after-expiry                                                                                       |
| C-D1  | HUNTED           | FixAcceptorMain compose                                                                                     |
| C-D2  | HUNTED           | drop-copy blank OWNER + honesty test                                                                        |
| C-D3  | HUNTED           | CompID/TIF refuse before POST                                                                               |
| C-D4  | HUNTED           | native L3 not L2                                                                                            |
| C-D5  | HUNTED           | SBE Real Logic octets                                                                                       |
| C-D6  | HUNTED           | startBasket H10                                                                                             |
| C-D7  | needs_validation | matching combo LIVE; trade holds not a new door                                                             |
| C-D8  | HUNTED           | R-E5 rejected occupancy                                                                                     |
| C-D9  | HUNTED           | R-E7 rejected occupancy                                                                                     |
| C-D10 | HUNTED           | R-promo rejected occupancy                                                                                  |
| C-D11 | HUNTED           | rulebook compose empty                                                                                      |
| C-D12 | HUNTED           | DEX fee `:-` empty                                                                                          |
| C-V1  | HUNTED           | venue price<=0                                                                                              |
| C-Q1  | HUNTED           | Q census LIVE/NAMED-REFUSE/SKIP/KEEP                                                                        |
| C-R1  | HUNTED           | R leftover LIVE or critic-rejected                                                                          |
| C-I1  | HUNTED           | dual-control already wraps freeze                                                                           |
| C-P1  | HUNTED           | Q-p2p live-offer KMS refuse                                                                                 |
| C-F1  | HUNTED           | named DEX fee empty                                                                                         |
| C-S1  | HUNTED           | skip register anvil only                                                                                    |
| C-P2  | HUNTED           | packages KEEP                                                                                               |
