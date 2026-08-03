# TRK-venue.aggregation — research / spec pack

**Tracker id:** `venue.aggregation`  
**Title:** External venue adapters via CCXT (cross-venue)  
**Module / phase:** `trade` · phase 2  
**Status on tip:** `ready` · **owner:** none  
**Depends on:** `trade.spot`  
**Tip freeze:** `origin/main` @ `c6d9e89e` (re-derive before implement)  
**Pack type:** research only — no implement swarm; no money invention; no dual-edit of Denon open money PRs; no `features.mjs` edit.

---

## 1 · What “done” means (plain language)

1. External venue market data (and trading if law allows) flows through **our** adapter fabric.
2. Title “via CCXT” is **historical** — §27 forbids third-party connectivity lib in money path; **no `ccxt` dep** by design.
3. Trading half deliberately not ready until product law says so.

## 2 · Current code state (tip `c6d9e89e`)

| Area         | Reality                                                         |
| ------------ | --------------------------------------------------------------- |
| Packages     | `venue-contracts`, `venue-adapter`                              |
| Mount        | svc-trade `TRADE_VENUE_MARK_*`                                  |
| Today        | Public market data (e.g. Binance spot) — re-verify adapter list |
| Trading half | **Not ready**                                                   |

## 3 · Doctrine constraints

| Law     | Implication                                  |
| ------- | -------------------------------------------- |
| §27     | No ccxt-in-money-path                        |
| Honesty | Marks labeled/sourced; adapter down → refuse |

## 4 · DoD sketch

- [ ] Clarify title vs §27 at mountain event
- [ ] Expand market-data venues as needed
- [ ] Trading half only with Denon law + Class M

## 5 · Open questions

1. Is market-data-only enough for `done`?
2. Must-have venue list.

## 6 · Estimated size

Per venue MD **M**; trading half **L+**.

## 7 · Related

- `packages/venue-adapter`, tracker A-TRADE-VENUE-OPS, `dex.quote-router`

## 8 · Non-goals

- No npm ccxt to satisfy old wording.
- No silent trading half.
