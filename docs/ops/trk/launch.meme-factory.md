# TRK-launch.meme-factory

**Title:** One-click meme launch + instant market + LP  
**Tracker:** `launch.meme-factory` · phase 5 · plane P · status `ready` · owner none (depends Shehzad AMM; product law heavy)  
**Depends on:** launch.token-factory (ready, not done — audit), protocol.amm (Shehzad M2)  
**Tip freeze:** `afa73a4f` · research only · no `features.mjs`

## DoD (plain language)

A creator can **one-click** deploy a meme token from the audited/factory path, create an **instant market**, and seed **LP** without the platform holding the LP keys or inventing pool state.

Every step either lands on chain with predicted addresses **or** refuses with typed errors — never “success” with fictional token address (zero factory lesson from token-factory).

Launch fee, if any, is a **Fiat ledger recipe** (§0.6), not value trapped in an un-audited fee sink on the factory.

## Path on tip

| Area          | Location                   |
| ------------- | -------------------------- |
| Token factory | svc-protocol launch        |
| AMM           | svc-protocol amm (Shehzad) |
| Product       | svc-launch **missing**     |

## Blocked by

| Blocker                   | Notes                             |
| ------------------------- | --------------------------------- |
| protocol.amm              | Shehzad M2 — required for LP      |
| token-factory audit/chain | Not done                          |
| Product law               | Curve, fees, market listing rules |

## First PR size (if free)

**Blocked** — no honest first code PR until AMM + factory usable. Spec only.

**Solid spec:** [TRK-launch.meme-factory.md](./TRK-launch.meme-factory.md)
