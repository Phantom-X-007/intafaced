# TRK-venue.aggregation

**Title:** External venue adapters via CCXT (cross-venue)  
**Tracker:** `venue.aggregation` · phase 2 · plane F · status `ready` · owner none  
**Depends on:** `trade.spot` (done) · **requires:** `packages/venue-adapter`, `packages/venue-contracts`

## DoD (plain language)

Cross-venue **market data** and (later) **trading** talk our adapter fabric —
**not** a third-party connectivity library in the money path (§27; no `ccxt` in
workspace by design). Second venue has a real `MarketDataAdapter`; trading half
either works with credentials + rails or throws typed `not_ready`. Marks never
invent mid when venue/book missing.

## Path on tip

| Area                     | Location                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------- |
| Contracts (done)         | `packages/venue-contracts`                                                            |
| Adapter fabric (partial) | `packages/venue-adapter` — **binance-spot public MD done**; trade/account `not_ready` |
| svc-trade mount (done)   | `TRADE_VENUE_MARK_*` + optional MM seed mid — README “Venue fabric mark”              |
| Trading half             | Credentials construct; place/cancel/balances **throw `not_ready`**                    |
| Venue Vault              | **Absent**                                                                            |
| Futures risk truth       | Human M3 — do not invent under this id                                                |

Title still says “via CCXT” — tracker **name is stale**; law is first-party fabric.

## Blocked by

| Blocker           | Notes                                                      |
| ----------------- | ---------------------------------------------------------- |
| Product / ops law | Which second venue; credential custody (Vault)             |
| Money / Class M   | Trading half + transfers = real external money — high bar  |
| Live-network CI   | Public MD optional; trading needs careful non-flake design |
| Shehzad M3        | Futures risk truth remains human-owned                     |

## First PR size (if free)

**S — second public MD venue only:** new `MarketDataAdapter` + factory id +
symbol map tests; no trading, no Vault. Or **S — honesty:** rename tracker title
via mountain event when shipping. Trading half = separate Class M PR after Vault
decision. Never invent mid.
