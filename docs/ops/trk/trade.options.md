# TRK-trade.options

**Title:** European options, cash-settled, full collateral in v1  
**Tracker:** `trade.options` · phase 2 · plane F · status `ready` · owner none (depends Shehzad futures)  
**Depends on:** trade.futures (**wip**, owner **shehzad002** M3)  
**Tip freeze:** `afa73a4f` · research only · no `features.mjs`

## DoD (plain language)

Users can trade **European** options that are **cash-settled** with **full collateral in v1** (no naked under-collateralized writer risk in v1).

Expiry settlement is deterministic from published mark/oracle rules — no discretionary “close at nice number.”

Collateral and premium move only via **ledger recipes**; positions are event-sourced honestly.

## Path on tip

| Area           | Location                |
| -------------- | ----------------------- |
| Options engine | **none**                |
| Dependency     | trade.futures (Shehzad) |
| Service        | services/svc-trade      |

## Blocked by

| Blocker       | Notes                        |
| ------------- | ---------------------------- |
| trade.futures | Shehzad M3 wip — hard depend |
| Product law   | Contract specs + mark        |
| Class M       | Full money path              |

## First PR size (if free)

**Blocked** — babysit futures; no options code PR from agents now.

**Solid spec:** [TRK-trade.options.md](./TRK-trade.options.md)
