# TRK-trade.ccxt-api

**Title:** CCXT-compatible public API (bots + terminals connect)  
**Tracker:** `trade.ccxt-api` · phase 2 · plane F · status `ready` · owner none  
**Depends on:** `trade.spot` (done)

## DoD (plain language)

External bots using a CCXT-shaped REST surface can discover markets, read
orderbook/ticker/trades/OHLCV, place/cancel orders, and read self balances/fills
without inventing empty markets as “exchange down.” Private REST is
edge-signed principal, fail-closed. Futures leverage/margin mode endpoints are
either real or absent — never stub success. OHLCV is real fills or honest empty.

## Path on tip

| Area         | Location                                                          |
| ------------ | ----------------------------------------------------------------- |
| REST surface | `services/svc-trade` + edge public/private routes (CCXT-shaped)   |
| Candles      | `TRADE_CANDLE_JOBS_*` materialize job (default **OFF**)           |
| Matching     | books empty until journal has orders or MM seeds                  |
| Private WS   | `ws.gateway` — not this REST mountain                             |
| Venue note   | Not “via CCXT package” — we **are** the compatibility layer (§27) |

**Tip residual:** large REST surface already partial (public + private order
paths, balances, fees, positions read). Still open: OHLCV empty until candle job
enabled with real fills; `setLeverage` / `setMarginMode` not mounted; MM/seed
depth residual; futures jobs default OFF. Empty book is honest `[]` (not 502).

## Blocked by

| Blocker             | Notes                                                                   |
| ------------------- | ----------------------------------------------------------------------- |
| Soft                | Live depth needs MM seed or organic flow (`trade.mm-bot` Nitro)         |
| Futures product law | Leverage/margin mode — **Shehzad / human M3** territory; agents babysit |
| Candle ops          | Enabling job is ops flag + markets with fills — not invent candles      |

Public spot REST residual is agent-accessible. Futures control endpoints are
**not** free craft under hard ownership.

## First PR size (if free)

**S:** enable path + tests for OHLCV materialize on one market with fixture
fills (job still default OFF in compose; document ops enable). **Or** document
bot onboarding (endpoints table + empty-book honesty) as Class N if craft is
saturated. **Do not** implement setLeverage without human futures law. No
tracker `done` while leverage endpoints missing **unless** product carves DoD
to “spot-only CCXT subset” explicitly in tracker note.
