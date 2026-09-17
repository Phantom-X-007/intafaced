# Rebar coverage ledger — full scope

**Law:** [`docs/SPEC-REBAR-ALL-OUT-2026-09-17.md`](../../SPEC-REBAR-ALL-OUT-2026-09-17.md)  
**FINISHED is illegal** while any row is `UNHUNTED`. Stage 1 killing IN-LEAD does not hunt this file.

Status: `UNHUNTED` → after Stage 3 read: `HUNTED` · `needs_validation` (named fact, no writer) · or spawned `OPEN` (fingerprint `service+path:line`). Same fingerprint twice = occupancy. Max 3 hunt→ship cycles.

This is the complete hunt set. Do not recook M00–M28. Do not hunt GET-clients, `Number(limit)`, or all compose `${VAR:-}`.

| id    | class       | named files / door                                                                                                            | status   |
| ----- | ----------- | ----------------------------------------------------------------------------------------------------------------------------- | -------- |
| C-M1  | money retry | `svc-bank` earn.deposit omit `positionId` (still mints UUID on tip)                                                           | UNHUNTED |
| C-M2  | money retry | bank standing-order create                                                                                                    | UNHUNTED |
| C-M3  | money retry | bank `getTxByKey` / crash after post                                                                                          | UNHUNTED |
| C-M4  | money retry | bank repay / proposeTransfer / addCollateral                                                                                  | UNHUNTED |
| C-M5  | money retry | trade OTC quote retry                                                                                                         | UNHUNTED |
| C-M6  | money retry | trade copy `planMirror` invented fill                                                                                         | UNHUNTED |
| C-L1  | ledger      | `svc-ledger` `/trpc/post` caller `entries` / non-recipe                                                                       | UNHUNTED |
| C-L2  | ledger      | dual-book door scan on money PRs                                                                                              | UNHUNTED |
| C-H1  | HMAC        | **complete** inbound mutate S2S still `accept-both` (no cap; GET banned; compose pin SEALED)                                  | UNHUNTED |
| C-A1  | auth        | WS JWT after expiry still serves private                                                                                      | UNHUNTED |
| C-D1  | door        | FIX `FixAcceptorMain` process + NOS→matching                                                                                  | UNHUNTED |
| C-D2  | door        | FIX drop-copy second session / completeness honesty                                                                           | UNHUNTED |
| C-D3  | door        | FIX CompID/TIF map + ack passthrough                                                                                          | UNHUNTED |
| C-D4  | door        | WS L3 from native queue, never L2                                                                                             | UNHUNTED |
| C-D5  | door        | SBE Real Logic octets not utf8 stub                                                                                           | UNHUNTED |
| C-D6  | door        | execution startBasket / POV hitch                                                                                             | UNHUNTED |
| C-D7  | door        | trade combo ledger holds                                                                                                      | UNHUNTED |
| C-D8  | door        | trade exercise/assignment/expiry JobHost                                                                                      | UNHUNTED |
| C-D9  | door        | what-if posts **no** money                                                                                                    | UNHUNTED |
| C-D10 | door        | promo without budget/end refuse                                                                                               | UNHUNTED |
| C-D11 | door        | matching rulebook compose empty ≠ invented version                                                                            | UNHUNTED |
| C-D12 | door        | DEX internal book fee unset (compose `:-`)                                                                                    | UNHUNTED |
| C-V1  | venue       | empty consensus / price 0                                                                                                     | UNHUNTED |
| C-Q1  | Q census    | every Q-* queue row LIVE or NAMED-REFUSE (blueprint/rust SKIP, support KEEP)                                                  | UNHUNTED |
| C-R1  | R leftover  | R-copy follow closed · R-agentic · R-fx · R-quant paper≠ledger · R-security dual-control · R-onboard · R-auth session on fill | UNHUNTED |
| C-I1  | identity    | dual-control / action-bound leftover mutates                                                                                  | UNHUNTED |
| C-P1  | p2p         | unencrypted instruments → refuse live offers                                                                                  | UNHUNTED |
| C-F1  | fee honesty | **named fee** compose still inventing a bps (not seed levels / pool / interval_ms)                                            | UNHUNTED |
| C-S1  | skip        | money-skip register still only anvil row (do not invent pending skips)                                                        | UNHUNTED |
| C-P2  | packages    | ledger-client / venue-adapter / sbe / greeks / contracts Zod3 — KEEP or leftover door                                         | UNHUNTED |

**Out (not a scope cut — law):** frontend Vue · INTACHAIN P1 · owner §8 magnitudes · npm ccxt · second book · compose HMAC `require` · occupancy mill.
