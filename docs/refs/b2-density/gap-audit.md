# Gap-audit — `b2-density`

**Tip base:** origin/main after #363  
**Date:** 2026-08-02  
**Surface(s):** `/exchange` desk + App chrome  
**Slice type:** CRAFT

## Inventory

| Area                          | Present                          | Keep / rebuild / replace              |
| ----------------------------- | -------------------------------- | ------------------------------------- |
| Fixed 726px desk columns      | Yes                              | **Replace** with viewport-fill height |
| Marketing footer on exchange  | Yes — huge dead black under desk | **Hide** on terminal routes           |
| Chart empty overlay           | Yes (#363)                       | Keep                                  |
| Page-content 200px footer pad | Yes                              | **Zero** on terminal routes           |

## Decision

- **Best path:** Surgical density — reclaim viewport; do not rebuild layout kit.
- **Free-hands:** Not constrained by legacy orange.
- **Why not rebuild:** Four-column terminal structure is sound; waste was chrome + fixed px.

## Gates

| Gate         | Expect                         |
| ------------ | ------------------------------ |
| 4 / 11       | Unchanged honesty              |
| Dim6 density | **Improve** vs PROOF-1 score 1 |

## Out of scope

⌘K · B3 money · full B13 multi-surface · auth Orca
