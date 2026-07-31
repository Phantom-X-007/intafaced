# Residual campaign high water — compaction-safe

**Owner program:** Nitro residual board (R1–R7)  
**Live tip:** re-check `git log origin/main -1` — git wins over SHAs below.

## Verdict

**COOK RUNNING.** Futures: recipes + open/close + planners + ticks + mark/rate ports + close wire with required exitPrice. **Not product-done.**

## Board map (complete)

| Row                     | Status     | Shipped                                                                          | Still open                         |
| ----------------------- | ---------- | -------------------------------------------------------------------------------- | ---------------------------------- |
| web.terminal            | wip        | Wave A/B craft sibling                                                           | Sub-accounts; full hotkeys         |
| ws.gateway              | wip        | Positions + F4 events                                                            | Mark-driven stream E2E             |
| pay.gateway             | wip        | Live rail + broadcast + refundId                                                 | Card/merchant; go-live X           |
| protocol.smart-accounts | ready      | Dev chain + CREATE2 honesty                                                      | Prod/audit/bundler X               |
| protocol.amm            | ready      | Factory + mint/swap proof                                                        | Audit; prod factory                |
| trade.futures           | wip        | F1–F5 recipes, planners, ticks, mark/rate ports, realizeProfit, close(exitPrice) | Live oracles, cron hosts, matching |
| Phase 5                 | ready many | Shell honesty where APIs exist                                                   | Full products                      |

## Merged this fire (do not redo)

#291–#305 residual futures stack + #299 high water + mark #300 + frontend sibling waves on main.

## Collision

| Lane             | Rule                             |
| ---------------- | -------------------------------- |
| #289 order-route | Do not touch from residual-coord |
| Frontend Wave B  | Do not steal vendor shell        |
| residual-coord   | This continuous chat             |

## NEXT QUEUE

1. Job host skeleton (ops cron wrapper)
2. Matching / mm-bot seed
3. Live index oracle product
4. WAVE-AUDIT already this file
5. Human X only: prod/secrets/go-live

## Hard bans

Fake done · invent marks/rates · force-push Denon · edit main checkout
