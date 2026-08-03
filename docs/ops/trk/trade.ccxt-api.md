# TRK-trade.ccxt-api

**Title:** CCXT-compatible public API (bots + terminals connect)  
**Tracker:** `trade.ccxt-api` · module `trade` · phase 2 · status `ready` · owner none  
**Depends on:** `trade.spot`  
**Tip freeze:** `origin/main` @ `04f9b1f2` (re-derive before implement)  
**Pack type:** thorough research upgrade (`docs/trk-research-pack-drain`) — no implement swarm; no money invention; no dual-edit Denon open money PRs; no `features.mjs` edit.

---

## 1 · What “done” means (plain language)

1. Bots use a **CCXT-shaped** REST surface (public data + private trading) against this venue.
2. Errors map via `ccxt-errors.ts`.
3. Unsupported toggles are **typed unsupported**, not silent missing routes.
4. OHLCV never invents candles.

## 2 · Current code state (tip `04f9b1f2`)

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

## 4 · DoD sketch (checkable — staged)

### DoD checks

- [ ] Supported-methods matrix vs residual
- [ ] Candle job product decision
- [ ] Futures/margin remain typed unsupported until law says otherwise

### Tracker `done` bar

Flip only when the title’s product promise is true in a real env — not when a stub route or empty skeleton merges.

## 5 · Open questions

1. Is partial REST enough for tracker `done`?
2. WS parity scope (likely separate).

## 6 · Estimated size

| Slice                        | Size    |
| ---------------------------- | ------- |
| Docs matrix + residual flags | **S**   |
| Candle job default/prod      | **S–M** |
| Full CCXT method parity      | **L+**  |

## 7 · Related docs / code

- `services/svc-trade/src/public-rest.ts`
- `private-rest.ts`
- `ccxt-errors.ts`

## 8 · Explicit non-goals for this pack

- No adding npm `ccxt` to money path.
- No inventing candles.
