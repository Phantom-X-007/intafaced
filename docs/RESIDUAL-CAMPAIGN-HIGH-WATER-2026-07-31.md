# Residual campaign high water — compaction-safe

**Owner program:** Nitro residual board (R1–R7)  
**Live tip:** re-check `git log origin/main -1` — **git wins**.

## Verdict

**COOK RUNNING.** Agent-safe residual for **trade.futures** and **mm-bot** money path landed through seeder orchestrator (pending merge after this tip).

**Not done:** ops enable / market list for seeder, house tradeFill for MM fills, live multi-venue index, pay card/go-live X, order-route #289 (other program).

## Board (complete)

| Row                     | Status     | On main                                          | Still open                       |
| ----------------------- | ---------- | ------------------------------------------------ | -------------------------------- |
| web.terminal            | wip        | Wave A/B + auth shell sibling                    | Sub-accounts product             |
| ws.gateway              | wip        | Positions + F4 events                            | Mark-driven E2E                  |
| pay.gateway             | wip        | Checkout + live crypto + merchant.create honesty | Card · KYB product · go-live X   |
| protocol.smart-accounts | ready      | Dev CREATE2 honesty                              | Prod/audit/bundler X             |
| protocol.amm            | ready      | Factory + mint/swap                              | Audit · prod factory             |
| trade.futures           | wip        | Full residual stack #291–#315                    | Live index · ops jobs ON         |
| trade.mm-bot            | ready      | planSeedQuotes + **seedMarket** hold→PO submit   | Ops job · market list · MM fills |
| Phase 5                 | ready many | Shell honesty                                    | Full products                    |

## Merged residual (do not redo)

#291–#324 residual futures/mm/pay honesty (except leave #289 order-route to its program).

## Ops (human)

```
TRADE_FUTURES_JOBS_ENABLED=true
TRADE_FUTURES_FUNDING_MARKET_IDS=<uuid,...>
# POST /internal/futures/funding-rate (S2S) to publish rates
# Seed mid must be external — planSeedQuotes / seedMarket refuse null mid
# Fund pot first: marketMakerSeedFund
# TRADE_MM_SEED_ENABLED=true
# TRADE_MM_SEED_MARKETS=marketId:BASE:QUOTE,...
# TRADE_MM_SEED_MIDS=marketId:mid,...   # external only; missing mid → skip
```

## NEXT QUEUE

1. House tradeFill path when MM seed orders fill
2. Live mid oracle (replace env mids)
3. Live index / multi-venue mark oracle
4. Candle aggregation job (OHLCV still empty-honest)
5. Pay card commercial socket (X) · human go-live secrets (X)

## Hard bans

Fake done · invent mid/rates/depth · force-push Denon · edit main checkout · merge #289 from residual without its program
