# TRK-trade.ccxt-api — research / spec pack

**Tracker id:** `trade.ccxt-api`  
**Title:** CCXT-compatible public API (bots + terminals connect)  
**Module / phase:** `trade`  
**Status on tip:** `ready` · **owner:** none  
**Tip freeze:** `origin/main` @ `56696496`  
**Pack type:** research only — **compatibility surface**, not embedding `ccxt` library in money path.

---

## 1 · What “done” means (plain language)

1. External bots/terminals can speak a **CCXT-shaped** public REST/ws surface.
2. Platform remains the connectivity layer (§27) — **no** `ccxt` package in the money path.
3. Prices/balances from platform services — never float-normalized invent.
4. Auth, rate limits, and market metadata honest when empty.

---

## 2 · Current code state (tip)

### 2.1 What is not this row

| Confusion                    | Truth                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| “via CCXT” venue aggregation | **Stale title language** — §27 forbids third-party connectivity lib in money path; no `ccxt` in workspace by design |
| Venue fabric                 | `packages/venue-contracts` + `venue-adapter` (Binance spot **public** MD only; trading half not_ready)              |
| DEX quote router             | Separate row `dex.quote-router` — refuse-or-real                                                                    |

### 2.2 Residual for titled public API

| Gap                               | Reality                                                                   |
| --------------------------------- | ------------------------------------------------------------------------- |
| CCXT-compatible route map         | Not a complete public bot API product on tip                              |
| Unified order create/cancel shape | Would wrap `svc-trade` / edge honestly                                    |
| WS parity                         | Platform `svc-ws` stream path — P-WS integrity blocked on Denon #433/#432 |

### 2.3 Venue fabric (related ops)

- `TRADE_VENUE_MARK_VENUE` + symbols default OFF
- Never invents mid on empty/unmapped
- Still ready not done: one public venue, trading half not built, vault absent, no live-network CI, M3 risk human

---

## 3 · Doctrine constraints

| Law           | Implication                                                    |
| ------------- | -------------------------------------------------------------- |
| §27           | No ccxt import on money path; parseLevels refuses JSON numbers |
| Compatibility | “CCXT-compatible” = wire shape, not dependency                 |
| P-WS          | Depth/stream integrity before promising bot WS parity          |
| No invent     | Empty markets → empty structures                               |

---

## 4 · DoD sketch

- [ ] Published OpenAPI of CCXT-like endpoints mapped to monorepo
- [ ] Auth model + rate limits
- [ ] Conformance tests against subset bots use
- [ ] Explicit non-support list (what CCXT methods we refuse)

---

## 5 · Open questions

1. REST-only v1 vs WS required for title?
2. Which CCXT version surface year to target?
3. Blocked on P-WS market-id law?

---

## 6 · Estimated size

| REST subset wrap | **M–L** |
| Full bot parity | **XL** |

---

## 7 · Related docs / code

- `services/svc-trade/README.md` venue fabric + feature table
- `packages/venue-adapter` public MD only
- `dex.quote-router` for quote honesty twin

---

## 8 · Explicit non-goals

- No adding `ccxt` dependency.
- No invent marks for bot happiness.
- No dual-edit Denon matching while #433 open.

---

## 9 · Mapping sketch (illustrative — not implement)

| CCXT-ish surface | Platform owner                          |
| ---------------- | --------------------------------------- |
| fetchMarkets     | trade markets list via edge             |
| fetchOrderBook   | ws/stream + matching — **P-WS blocked** |
| createOrder      | trade order path + holds                |
| fetchBalance     | ledger-backed account APIs              |

Each mapping must preserve decimal strings and refuse invent zeros.

## 10 · Blocked by integrity

P-WS-REPORT still blocked by Denon **#433** matching + **#432** edge. Promising bot WS parity before market-id law is a stamp lie.

## 11 · First PR shape

| PR  | Scope                              |
| --- | ---------------------------------- |
| 1   | OpenAPI of REST subset + auth      |
| 2   | fetchMarkets + fetchTicker only    |
| 3   | Order paths after money self-audit |

## 12 · One-line residual

CCXT-**compatible** wire shape without `ccxt` dependency; P-WS integrity before bot WS parity claims.
