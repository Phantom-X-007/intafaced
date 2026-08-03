# TRK-trade.options

**Title:** European options, cash-settled, full collateral in v1  
**Tracker:** `trade.options` · module `trade` · phase 2 · status `ready` · owner none  
**Depends on:** `trade.futures`  
**Tip freeze:** `origin/main` @ `04f9b1f2` (re-derive before implement)  
**Pack type:** thorough research upgrade (`docs/trk-research-pack-drain`) — no implement swarm; no money invention; no dual-edit Denon open money PRs; no `features.mjs` edit.

---

## 1 · What “done” means (plain language)

1. European, cash-settled options with **full collateral in v1**.
2. Settlement/risk under trade/futures dependency order.
3. Premium/settlement only via ledger recipes.

## 2 · Current code state (tip `04f9b1f2`)

| Area            | Reality                                         |
| --------------- | ----------------------------------------------- |
| Options product | **Not built** as titled                         |
| Dependency      | `trade.futures` must be honest first            |
| Risk            | Futures risk is Shehzad hard mountain — babysit |

## 3 · Doctrine constraints

| Law                | Implication                      |
| ------------------ | -------------------------------- |
| Full collateral v1 | Refuse under-collateral          |
| Class M            | All money recipes audited        |
| Product law        | Do not invent options parameters |

## 4 · DoD sketch (checkable — staged)

### DoD checks

- [ ] ADR: underlyings, expiry, settlement asset
- [ ] Contracts + risk + recipes
- [ ] Matching/assignment
- [ ] Admin risk kills

### Tracker `done` bar

Flip only when the title’s product promise is true in a real env — not when a stub route or empty skeleton merges.

## 5 · Open questions

1. Mark/oracle source.
2. Implement ownership (Shehzad vs residual).

## 6 · Estimated size

| Slice                  | Size                       |
| ---------------------- | -------------------------- |
| ADR + refusal skeleton | **S**                      |
| Full program           | **XL** after futures solid |

## 7 · Related docs / code

- `trade.futures`
- risk docs
- Denon/Shehzad boards

## 8 · Explicit non-goals for this pack

- No naked demo options.
- No agent futures-risk implement under this id.
