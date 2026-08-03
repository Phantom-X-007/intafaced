# TRK-trade.options

**Title:** European options, cash-settled, full collateral in v1  
**Tracker:** `trade.options` · phase 2 · plane F · status `ready` · owner none  
**Depends on:** `trade.futures`

## DoD (plain language)

European cash-settled options with full collateral in v1. Risk and money paths
are Class M; agents do not invent payoff formulas without Denon product law.

## Path on tip

| Area     | Location               |
| -------- | ---------------------- |
| Trade    | futures residual first |
| Matching | engine residual        |

## Blocked by

| Blocker       | Notes                                |
| ------------- | ------------------------------------ |
| trade.futures | Prerequisite mountain                |
| Product law   | Denon hard — payoff, margin, expiry  |
| Class M       | Full collateral + settlement recipes |

## First PR size (if free)

**Research + law only** until futures done. First code PR after law: contract
specs + refuse path for unsupported Greeks invent.

**Solid spec:** [TRK-trade.options.md](./TRK-trade.options.md)
