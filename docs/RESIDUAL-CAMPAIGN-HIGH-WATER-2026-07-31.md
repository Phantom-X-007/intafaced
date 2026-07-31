# Residual campaign high water — compaction-safe

**Owner program:** Nitro residual board (R1–R7)  
**Live tip:** re-check `git log origin/main -1` — **git wins**.

## Verdict

**COOK RUNNING · futures residual stack productized under honest partials.**  
Jobs exist and are **default OFF**. Live multi-venue index + matching seed + ops enable remain open. **Not tracker-done.**

## Board (complete set)

| Row                     | Status     | On main                                                                                                                                               | Still open                                                 |
| ----------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| web.terminal            | wip        | Wave A/B craft sibling                                                                                                                                | Sub-accounts product                                       |
| ws.gateway              | wip        | Positions + positionUpdated                                                                                                                           | Mark-driven E2E load                                       |
| pay.gateway             | wip        | Live rail + broadcast + refundId                                                                                                                      | Card/merchant; go-live X                                   |
| protocol.smart-accounts | ready      | Dev CREATE2 + honesty                                                                                                                                 | Prod/audit/bundler X                                       |
| protocol.amm            | ready      | Factory + mint/swap proof                                                                                                                             | Audit; prod factory                                        |
| **trade.futures**       | **wip**    | Recipes F1–F5 · open/close · planners · ticks · mark/rate ports · mark-from-depth · job-host · SQL loaders/stores/closer · **startFuturesJobs (OFF)** | Live index oracle · matching seed · ops enable · go-live X |
| Phase 5                 | ready many | Shell honesty where APIs exist                                                                                                                        | Full products                                              |

## Merged residual fire (do not redo)

#291 funding planner · #292 liq planner · #293 funding tick · #296 liq tick · #300 mark-source · #303 rate-source · #304 realizeProfit · #305 close planner · #306 close wire · #307 WAVE-AUDIT · #308 job-host · #309 mark-from-depth · #310 loaders · #311 stores/closer · **#312 jobs wire**

## Collision

| Lane             | Rule                             |
| ---------------- | -------------------------------- |
| #289 order-route | Do not touch from residual-coord |
| Frontend Wave B  | Do not steal vendor shell        |
| residual-coord   | This continuous chat             |

## Ops enable (when ready — human)

```
TRADE_FUTURES_JOBS_ENABLED=true
TRADE_FUTURES_FUNDING_MARKET_IDS=<uuid,uuid>
# optional intervals: TRADE_FUTURES_LIQ_INTERVAL_MS / TRADE_FUTURES_FUNDING_INTERVAL_MS
```

Empty book / missing rate → ticks **skip** (no invent). Funding rates must be published into the rate book (oracle later).

## NEXT QUEUE

1. Live index / multi-venue mark oracle product
2. Matching / mm-bot seed depth so mid marks exist
3. Ops enable jobs in non-prod then prod (X)
4. Public funding-rate REST honesty if still stub
5. Human X: secrets · go-live · counsel

## Hard bans

Fake done · invent marks/rates/market lists · force-push Denon · edit main checkout
