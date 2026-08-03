# TRK-mining.pool

**Title:** Stratum share protocol, PPLNS payouts  
**Tracker:** `mining.pool` · phase 5 · plane F · status `ready` · owner none (Denon product direction historically)  
**Depends on:** token.emissions (done)  
**Tip freeze:** `afa73a4f` · research only · no `features.mjs`

## DoD (plain language)

Miners can connect via **Stratum** (or stated successor), submit shares, and see **live** accepted/rejected honesty — no fabricated hashrate dashboards.

Payouts use **PPLNS** (or published scheme) as **ledger recipes** to miner accounts — pool fee 1–3% to house per doctrine, never balances held outside ledger.

Solo + pooled modes if product requires; dashboards read ledger + share DB, not invent IFC.

## Path on tip

| Area         | Location                |
| ------------ | ----------------------- |
| Pool service | **none**                |
| Emissions    | svc-token (done)        |
| Vendor       | quarantined legacy only |

## Blocked by

| Blocker     | Notes                          |
| ----------- | ------------------------------ |
| Product law | What is mined + stratum vs API |
| Class M     | PPLNS payouts are money        |
| Service     | Greenfield                     |

## First PR size (if free)

**M — share accounting** no payout; money PR separate Class M.

**Solid spec:** [TRK-mining.pool.md](./TRK-mining.pool.md)
