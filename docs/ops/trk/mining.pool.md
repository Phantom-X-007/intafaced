# TRK-mining.pool

**Title:** Stratum share protocol, PPLNS payouts  
**Tracker:** `mining.pool` · phase 5 · plane F · status `ready` · owner none  
**Depends on:** `token.emissions`

## DoD (plain language)

Pool accepts shares via Stratum-class protocol; PPLNS payouts via ledger/token
emissions recipes only. No pool-held user balances outside ledger.

## Path on tip

| Area  | Location                        |
| ----- | ------------------------------- |
| Token | `services/svc-token/` emissions |
| Pool  | **no service yet**              |

## Blocked by

| Blocker         | Notes                |
| --------------- | -------------------- |
| token.emissions | Prerequisite         |
| Product law     | Coin/algorithm scope |
| Money Class M   | Payout automation    |

## First PR size (if free)

**L greenfield:** separate service likely; first PR share accounting + ledger
payout recipe design doc. Not a night implement swarm.

**Solid spec:** [TRK-mining.pool.md](./TRK-mining.pool.md)
