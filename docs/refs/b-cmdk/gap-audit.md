# Gap-audit — `b-cmdk`

**Tip base:** d519b87 + this PR  
**Date:** 2026-08-02  
**Surface(s):** global App chrome  
**Slice type:** CRAFT

## Inventory

| Area                        | Present               | Decision                                   |
| --------------------------- | --------------------- | ------------------------------------------ |
| Desk hotkeys (B/S/T/X//)    | Yes · desk-hotkeys.js | Keep; meta keys ignored                    |
| Global route search         | Absent                | **Build** CommandPalette                   |
| Fake market list for search | N/A                   | **Never invent** — markets only from store |

## Decision

- **Best path:** Global ⌘K/Ctrl+K palette over iView-free panel using P21 tokens.
- **Free-hands:** Not constrained by legacy orange.
- **Why not third-party cmdk kit:** Design Bar — one kit; no second system.

## Gates

| Gate         | Expect                             |
| ------------ | ---------------------------------- |
| 4 Honesty    | No invented markets in empty store |
| Dim keyboard | Improve                            |

## Out of scope

Fuzzy AI search · order-route · seeded balances
