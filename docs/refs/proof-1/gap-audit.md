# Gap-audit — `proof-1`

**Tip SHA:** `5f2f8fe` (origin/main at PROOF-1)  
**Date:** 2026-08-02  
**Surface(s):** index · `/exchange` · login · uc/money · uc/withdraw (unauth path)  
**Slice type:** PROOF  

## Inventory (what exists at tip)

| Area | Present | Keep / rebuild / replace |
| --- | --- | --- |
| Wave A honesty dialect (not empty / not free / unavailable) | Yes — index + desk book/fee/blotter | **Keep** — law |
| P21 tokens (`intafaced.css`) | Yes | **Keep** until Nitro re-picks |
| Desk layout (watchlist · chart · book · ticket · blotter) | Yes — structure | **Craft densify** (B2) — do not rebuild kit |
| Chart empty overlay | Code present (`chartFailed` / `!feedLive`) | **Fix visibility** — crop shows silent black (B13 P0) |
| Ticket fee honesty | Yes — “unknown · not free” | **Keep** |
| Dual-book / MoneyIndex craft | Code on tip; unauth → login | **Deep B3** when auth Orca available |
| Withdraw receipt + lock | A2 on main | **Keep**; re-Orca when auth |
| Global ⌘K | Absent | **B-CMDK** or written waiver |
| LWC multi-pane | Not started | Wave C — blocked on B DoD |
| Order-route / futures | Other PRs (#359 etc.) | **Do not touch** Stream A |

## Decision

- **Best path for pro workbench** (not minimum delta): Prove honesty holds (this PR), then B13 P0 chart overlay + density hierarchy, then residual craft (⌘K / B3 / B4) — not another replan.
- **Free-hands line:** This slice was not constrained by legacy orange/#86 as a quality ceiling. P21 teal stays modular.
- **Why not full rebuild:** Vue2/iView shell is the ship surface; Design Bar forbids second kit; honesty already shipped; rebuild would burn weeks without density gain.

## Gates touched

| Gate | Expect |
| --- | --- |
| 4 Honesty | **pass** public desk/index — no fake markets/balances |
| 11 Feed | **pass** book/fee; chart overlay **flagged** |
| 12 Irreversible | holds on code path; withdraw not re-eyed logged-in |
| 18 Recovery | empty/error labeled; sign-in as recovery for private panes |
| 19 Numeric | zeros/fee unknown not painted as free |

## Out of scope this PR

- Auth fixture money / seeded balances  
- Order-route residual (#359) · sub-accounts selector (#358)  
- Admin inventory · Wave C charts  
- Claiming density “world-class”  
