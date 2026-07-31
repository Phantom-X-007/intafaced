# Residual campaign high water — compaction-safe

**Owner program:** Nitro residual board (R1–R7)  
**Live tip:** re-check `git log origin/main -1` — **git wins**.

## Verdict

**COOK RUNNING.** Agent-safe residual for **trade.futures** and honesty packs for **pay** / **mm-bot** landed through **#321**.

**Not done:** live multi-venue index, house seeder **money path**, matching seed ops, pay card/go-live X, order-route #289 (other program).

## Board (complete)

| Row                     | Status     | On main                                          | Still open                      |
| ----------------------- | ---------- | ------------------------------------------------ | ------------------------------- |
| web.terminal            | wip        | Wave A/B + auth shell sibling                    | Sub-accounts product            |
| ws.gateway              | wip        | Positions + F4 events                            | Mark-driven E2E                 |
| pay.gateway             | wip        | Checkout + live crypto + merchant.create honesty | Card · KYB product · go-live X  |
| protocol.smart-accounts | ready      | Dev CREATE2 honesty                              | Prod/audit/bundler X            |
| protocol.amm            | ready      | Factory + mint/swap                              | Audit · prod factory            |
| trade.futures           | wip        | Full residual stack #291–#315                    | Live index · ops jobs ON        |
| trade.mm-bot            | ready      | Research + **planSeedQuotes** (#321)             | Seeder money path · market list |
| Phase 5                 | ready many | Shell honesty                                    | Full products                   |

## Merged residual (do not redo)

#291–#321 residual futures/mm/pay honesty (except leave #289 order-route to its program).

## Ops (human)

```
TRADE_FUTURES_JOBS_ENABLED=true
TRADE_FUTURES_FUNDING_MARKET_IDS=<uuid,...>
# POST /internal/futures/funding-rate (S2S) to publish rates
# Seed mid must be external — planSeedQuotes refuses null mid
```

## NEXT QUEUE

1. House seeder job: fund `house/market-maker` + placeSeed intents (Class M)
2. Live index / multi-venue mark oracle
3. Candle aggregation job (OHLCV still empty-honest)
4. Pay card commercial socket (X)
5. Human go-live secrets (X)

## Hard bans

Fake done · invent mid/rates/depth · force-push Denon · edit main checkout · merge #289 from residual without its program
