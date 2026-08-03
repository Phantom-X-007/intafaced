# TRK-trade.ccxt-api — research / spec pack

**Tracker id:** `trade.ccxt-api`  
**Title:** CCXT-compatible public API (bots + terminals connect)  
**Module / phase:** `trade` · phase 2  
**Status on tip:** `ready` · **owner:** none  
**Depends on:** `trade.spot`  
**Tip freeze:** `origin/main` @ `c6d9e89e` (re-derive before implement)  
**Pack type:** research only — no implement swarm; no money invention; no dual-edit of Denon open money PRs; no `features.mjs` edit.

---

## 1 · What “done” means (plain language)

1. Bots use a **CCXT-shaped** REST surface (public data + private trading) against this venue.
2. Errors map via `ccxt-errors.ts`.
3. Unsupported toggles are **typed unsupported**, not silent missing routes.
4. OHLCV never invents candles.

## 2 · Current code state (tip `c6d9e89e`)

| Area       | Reality                                                                     |
| ---------- | --------------------------------------------------------------------------- |
| Public     | `public-rest.ts` — markets, book, tickers, trades, ohlcv                    |
| Private    | `private-rest.ts` — orders + placeOrder money path                          |
| Errors     | `ccxt-errors.ts`                                                            |
| Tracker    | **partial** — candle materialize job default OFF; futures typed unsupported |
| npm `ccxt` | **Forbidden** in money path by design (§27)                                 |

## 3 · Doctrine constraints

| Law          | Implication                                               |
| ------------ | --------------------------------------------------------- |
| Money path   | Private place stays existing recipes / Class M discipline |
| Honesty      | No invented OHLCV                                         |
| Jurisdiction | Private routes enforce principal + matrix                 |

## 4 · DoD sketch

- [ ] Supported-methods matrix vs residual
- [ ] Candle job product decision
- [ ] Futures/margin remain typed unsupported until law says otherwise

## 5 · Open questions

1. Is partial REST enough for tracker `done`?
2. WS parity scope (likely separate).

## 6 · Estimated size

Docs matrix **S**; candle job **S–M**; full parity **L+**.

## 7 · Related

- `services/svc-trade/src/public-rest.ts`, `private-rest.ts`, `ccxt-errors.ts`
- Short stub `trade.ccxt-api.md`

## 8 · Non-goals

- No adding npm `ccxt` to money path.
- No inventing candles.
