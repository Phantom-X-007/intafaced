# TRK-trade.ccxt-api

**Title:** CCXT-compatible public API (bots + terminals connect)  
**Tracker:** `trade.ccxt-api` · phase 2 · plane F · status `ready` · owner none  
**Depends on:** `trade.spot` (done)  
**Tip freeze:** `origin/main` @ `c773dafa` (re-derive before implement)  
**Pack type:** research only — no invent candles/books; no futures product law; no `features.mjs` edit.

## DoD (plain language)

External bots using a CCXT-shaped REST surface can discover markets, read
orderbook/ticker/trades/OHLCV, place/cancel orders, and read self balances/fills
without inventing empty markets as “exchange down.” Private REST is
edge-signed principal, fail-closed. Futures leverage/margin mode endpoints are
either **real** or **typed unsupported** — never stub success. OHLCV is real
fills or honest empty.

## Path on tip

| Area         | Location                                                                       |
| ------------ | ------------------------------------------------------------------------------ |
| REST surface | `services/svc-trade` `public-rest.ts` + `private-rest.ts`                      |
| OHLCV        | Live SQL aggregation from **non-seeded** taker fills; optional materialize job |
| Candles job  | `TRADE_CANDLE_JOBS_*` default **OFF** (`candle-jobs.ts`)                       |
| Matching     | Books empty until journal has orders or MM seeds                               |
| Private WS   | `ws.gateway` — not this REST mountain                                          |
| Venue note   | Not “via CCXT package” — we **are** the compatibility layer (§27)              |

**Tip residual (refresh vs older notes):** large public + private surface already
partial (markets, book, ticker, trades, ohlcv, orders, balances, fees, positions
read/close with required `exitPrice`). `POST …/positions/leverage` and
`…/margin-mode` are **mounted as** `derivativesNotSupported` /
`trade.leverage_unsupported` / `trade.margin_mode_unsupported` — not silent
stubs. Empty book is honest `[]` (not 502). OHLCV empty until real fills exist.

## Blocked by

| Blocker             | Notes                                                                 |
| ------------------- | --------------------------------------------------------------------- |
| Soft                | Live depth needs MM seed or organic flow (`trade.mm-bot` Nitro)       |
| Futures product law | Real leverage/margin mode — **Shehzad / human M3** territory; babysit |
| Candle ops          | Enabling job is ops flag + markets with fills — never invent candles  |

Public spot REST residual is agent-accessible. Implementing **real** setLeverage
is **not** free craft under hard ownership.

## First PR size (if free)

**S:** ops enable path + tests for OHLCV materialize on one market with fixture
fills (job still default OFF in compose; document ops enable). **Or** bot
onboarding docs (endpoints table + empty-book honesty) as Class N. **Do not**
implement real setLeverage without human futures law. No tracker `done` while
product still expects full CCXT derivatives subset **unless** product carves
DoD to “spot-only + typed unsupported” explicitly in tracker note.
