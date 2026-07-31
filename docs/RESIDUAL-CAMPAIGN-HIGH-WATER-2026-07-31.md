# Residual campaign high water — compaction-safe

**Owner program:** Nitro residual board (R1–R7)  
**Live tip:** re-check `git log origin/main -1` — **git wins**.

## Verdict

**COOK RUNNING.** Futures residual stack is **agent-complete for honest partials**: recipes, open/close with exitPrice, planners, ticks, SQL loaders/stores, jobs wire **default OFF**, funding publish (S2S) + public GET only when published.

**Not tracker-done.** Live multi-venue index, matching seed depth, ops enable, go-live X remain.

## Board (complete)

| Row                     | Status     | On main                          | Still open                                      |
| ----------------------- | ---------- | -------------------------------- | ----------------------------------------------- |
| web.terminal            | wip        | Wave A/B sibling                 | Sub-accounts; full hotkeys product              |
| ws.gateway              | wip        | Positions channel + F4 events    | Mark-driven live updates E2E                    |
| pay.gateway             | wip        | Live rail + broadcast + refundId | Card acquiring; merchant; go-live X             |
| protocol.smart-accounts | ready      | Dev CREATE2 + honesty            | Prod/audit/bundler X                            |
| protocol.amm            | ready      | Factory + mint/swap proof        | Audit; prod factory                             |
| **trade.futures**       | **wip**    | Full residual stack through #315 | Live index · matching seed · ops ON · go-live X |
| Phase 5                 | ready many | Shell honesty where APIs exist   | Full products                                   |

## Merged residual fire (do not redo)

#291–#296 · #300 · #303–#315 (planners, ticks, marks, rates, close, jobs OFF, stores, loaders, funding GET/publish)

## Collision

| Lane             | Rule                             |
| ---------------- | -------------------------------- |
| #289 order-route | Do not touch from residual-coord |
| Frontend         | Do not steal vendor shell        |
| residual-coord   | Continuous autonomous COOK       |

## Ops enable (human)

```
TRADE_FUTURES_JOBS_ENABLED=true
TRADE_FUTURES_FUNDING_MARKET_IDS=<uuid,...>
# Oracle: POST /internal/futures/funding-rate (service auth) with marketId+rate
```

Empty book / unpublished rate → ticks and public funding-rate **skip/refuse** (no invent).

## NEXT QUEUE

1. Matching / mm-bot seed depth (so mid marks exist)
2. Live multi-venue / index mark product
3. Ops enable jobs non-prod → prod (X)
4. pay card/merchant residual research
5. Human X: secrets · go-live · counsel

## Hard bans

Fake done · invent marks/rates · force-push Denon · edit main checkout
