# Gap-audit — `b13-chart-empty`

**Tip base:** PROOF-1 branch (`feat/app-proof-scorecard`)  
**Date:** 2026-08-02  
**Surface(s):** `/exchange` chart panel  
**Slice type:** CRAFT (honesty visibility P0)

## Inventory

| Area                         | Present                                  | Keep / rebuild / replace                 |
| ---------------------------- | ---------------------------------------- | ---------------------------------------- |
| Chart empty copy in template | Yes (`chartFailed` / `!feedLive`)        | **Keep** copy; **fix** stacking/contrast |
| Silent black chart host      | Yes — host painted over faint empty text | **Dim host + z-index empty**             |
| Book / fee honesty           | Yes (PROOF-1)                            | Keep                                     |

## Decision

- **Best path:** Surgical overlay fix only — do not rebuild chart stack.
- **Free-hands:** Not constrained by legacy orange.
- **Why not rebuild:** Empty copy already correct; visibility was the defect.

## Gates

| Gate         | Expect                                         |
| ------------ | ---------------------------------------------- |
| 4 Honesty    | pass — still no fake candles                   |
| 11 Feed      | **improve** — empty chart readable at a glance |
| 12 / 18 / 19 | unchanged                                      |

## Out of scope

Density B2 · ⌘K · auth money · order-route
