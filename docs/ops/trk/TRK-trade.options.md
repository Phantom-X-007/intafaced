# TRK-trade.options — research / spec pack

**Tracker id:** `trade.options`  
**Title:** European options, cash-settled, full collateral in v1  
**Module / phase:** `trade` · phase 2  
**Status on tip:** `ready` · **owner:** none  
**Depends on:** `trade.futures`  
**Tip freeze:** `origin/main` @ `c6d9e89e` (re-derive before implement)  
**Pack type:** research only — no implement swarm; no money invention; no dual-edit of Denon open money PRs; no `features.mjs` edit.

---

## 1 · What “done” means (plain language)

1. European, cash-settled options with **full collateral in v1**.
2. Settlement/risk under trade/futures dependency order.
3. Premium/settlement only via ledger recipes.

## 2 · Current code state (tip `c6d9e89e`)

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

## 4 · DoD sketch

- [ ] ADR: underlyings, expiry, settlement asset
- [ ] Contracts + risk + recipes
- [ ] Matching/assignment
- [ ] Admin risk kills

## 5 · Open questions

1. Mark/oracle source.
2. Implement ownership (Shehzad vs residual).

## 6 · Estimated size

**XL** after futures solid. First PR: ADR + refusal skeleton — **S**.

## 7 · Related

- `trade.futures`, risk docs, Denon/Shehzad boards

## 8 · Non-goals

- No naked demo options.
- No agent futures-risk implement under this id.
