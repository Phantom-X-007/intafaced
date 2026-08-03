# TRK-trade.forex

**Title:** Fiat pairs on the same engine  
**Tracker:** `trade.forex` · phase 2 · plane F · status `ready` · owner none  
**Depends on:** `trade.spot`, `pay.rails`

## DoD (plain language)

Fiat pairs trade on the same matching/trade engine shape as spot crypto, with
pay rails for fiat settlement. Money decimal-safe; no dual book.

## Path on tip

| Area     | Location                  |
| -------- | ------------------------- |
| Trade    | `services/svc-trade/`     |
| Matching | `services/svc-matching/`  |
| Pay      | rails — often human-owned |

## Blocked by

| Blocker     | Notes                             |
| ----------- | --------------------------------- |
| pay.rails   | May be Shehzad/human Class M/X    |
| Product law | Which fiat pairs, hours, holidays |
| Partner PRs | matching/edge open — no dual-edit |

## First PR size (if free)

**Defer** until pay.rails + matching free. Spec-only: pair catalog + settlement
recipe outline.

**Solid spec:** [TRK-trade.forex.md](./TRK-trade.forex.md)
