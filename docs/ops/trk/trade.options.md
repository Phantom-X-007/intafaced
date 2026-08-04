# TRK-trade.options — research / spec pack

**Tracker id:** `trade.options`  
**Title:** European options, cash-settled, full collateral in v1  
**Module / phase:** `trade`  
**Status on tip:** `ready` · blocked practically on **futures risk / multi-asset law** (Shehzad M3 adjacency + Denon product law)  
**Tip freeze:** `origin/main` @ `56696496`  
**Pack type:** research only — **babysit implement**; no invent greeks or marks.

---

## 1 · What “done” means (plain language)

1. European, cash-settled options with **full collateral v1** as titled.
2. Listing uses existing `market_kind` enum support without half-wired risk.
3. Risk/margin law exists and is enforced — not spot engine with an options label.
4. Settlement marks honest or refuse — no invent IV surface for PnL.

---

## 2 · Current code state (tip)

### 2.1 Enum vs product

| Piece                            | Reality                                             |
| -------------------------------- | --------------------------------------------------- |
| `market_kind` includes `options` | Listing later is data + risk, not only enum         |
| svc-trade README                 | Options listed as separate feature from spot        |
| Full options engine              | **Not** shipped as titled product                   |
| Collateral model                 | Title requires full collateral v1 — design residual |

### 2.2 Hard blockers (coordination)

| Blocker                 | Why                                          |
| ----------------------- | -------------------------------------------- |
| Futures risk M3         | Shehzad hard ownership — agents babysit only |
| Multi-asset product law | Denon directs                                |
| Mark integrity          | Same no-invent law as venue marks            |

### 2.3 Open partner pile

Denon money/integrity PRs (#445 tests, #433 matching, …) — no dual-edit; options craft would path-check matching/trade heavily.

---

## 3 · Doctrine constraints

| Law                | Implication                          |
| ------------------ | ------------------------------------ |
| Full collateral v1 | No naked invent margin               |
| Ledger             | Premium/settlement via recipes       |
| Human M3           | No agent freestyle risk engine       |
| No invent greeks   | UI shows absence rather than fake IV |

---

## 4 · DoD sketch (when unblocked)

- [ ] Product law ADR from Denon
- [ ] Risk engine accepts options positions under full collateral
- [ ] Cash settlement path + tests
- [ ] Market hours / expiry schedule refuse cases

---

## 5 · Open questions

1. Underlyings: only crypto index first?
2. Who owns options risk code path vs futures M3?
3. Oracle/mark source for settlement?

---

## 6 · Estimated size

| Spec/ADR only | **S** |
| Full product after law | **XL** |

---

## 7 · Related docs / code

- `services/svc-trade/README.md` feature table
- Shehzad hard board / Denon hard task board
- Long-form twin: [TRK-trade.options.md](./TRK-trade.options.md)

---

## 8 · Explicit non-goals

- No implement while M3/human risk law open.
- No invent options chain UI.
- No features.mjs done flip from research.

---

## 9 · Why agents babysit only

| Board             | Role                                                    |
| ----------------- | ------------------------------------------------------- |
| Shehzad hard M3   | Futures risk — options risk will touch same money spine |
| Denon product law | Multi-asset instruments direction                       |
| Nitro Class X     | Any production go-live of risk                          |

Research packs must not become shadow ADRs that force product law.

## 10 · Pre-implement gate

- [ ] Denon ADR or board row explicitly frees options craft
- [ ] Path intersect clean vs #433 matching / money PRs
- [ ] Full collateral model written with ledger recipes
- [ ] Mark/oracle law for settlement

## 11 · Explicit wait state

Until gates pass: **no** options UI, **no** invent IV boards, **no** features.mjs status flip.

## 12 · One-line residual

Babysit until Denon multi-asset law + Shehzad M3 risk path free; no invent greeks.
