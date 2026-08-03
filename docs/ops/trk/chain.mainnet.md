# TRK-chain.mainnet

**Title:** INTACHAIN — CometBFT + native CLOB module  
**Tracker:** `chain.mainnet` · phase 4P · plane P · status `ready` (runtime **blocked** until deps) · owner none  
**Depends on:** `matching.engine` (done) · `protocol.amm` (**ready**, owner **shehzad002** — not done)  
**Tip freeze:** `origin/main` @ `c6d9e89e` (re-derive before implement)  
**Pack type:** research only — no implement; no `features.mjs` edit; no money invention.  
**Ownership:** Shehzad board **S-D4** (CometBFT / app-chain residual) + **S-D1–D3** sequencing. Agents **babysit only** on implement.

## DoD (plain language)

A real **INTACHAIN** network exists (not anvil theatre sold as mainnet): Cosmos SDK / CometBFT app-chain with a **native CLOB module** (price-time priority, tick/lot rules aligned with Fiat Plane `svc-matching` spec), IFC as gas + staking security, one-block finality SLO published, and node ops path documented under `services/svc-chain/` (doctrine §17.5 — **does not exist on tip**). Status is never marked `done` on local-dev RPC alone.

## Path on tip

| Area                                     | Location                                                               |
| ---------------------------------------- | ---------------------------------------------------------------------- |
| Doctrine                                 | `INTAFACED_DEFINITIVE_BUILD.md` §17.1–17.3, §21 phase **4P**           |
| Shehzad board                            | `docs/SHEHZAD-BLOCKCHAIN-TASK-BOARD-2026-08-03.md` Tier D (S-D1…S-D4)  |
| Fiat matching (shared spec target)       | `services/svc-matching/` — dual-target for INTACORE later              |
| Protocol contracts (P0 rails, not chain) | `services/svc-protocol/`                                               |
| Missing                                  | `services/svc-chain/` · `services/svc-bridge/` · app-chain source tree |

**Tip residual:** **zero** chain binary / CometBFT module / mainnet genesis. Protocol plane today is **contracts on a configured EVM RPC** (dev chain / external L2 later). Tracker row is free-to-research; **implement is blocked** by unfinished `protocol.amm` (and product sequencing P0 → P1).

## Blocked by

| Blocker                      | Notes                                                               |
| ---------------------------- | ------------------------------------------------------------------- |
| **protocol.amm** (human M2)  | Dep not done; Shehzad owns suite honesty                            |
| **P0 rails decision (S-D1)** | Which L2 / HyperEVM / anvil-only for near-term — ADR first          |
| **Product law / direction**  | Denon sets chain product law; agents do not invent consensus params |
| **Class X**                  | Mainnet keys, validator economics, go-live                          |
| Not free craft               | Any “status:done” without a live network is vapor                   |

## First PR size (if free)

**Docs/ADR only (this pack + S-D1):** written P0 rails + phased milestones (P0 contracts → P1 CometBFT+CLOB → P2 Rust core). **No** chain code PR from Nitro agents while Shehzad M2 / S-D\* own the runway. First engineering PR after law: skeleton `svc-chain` config + genesis **testnet** with honest “not mainnet” labels — never mark tracker done until public chain id + CLOB module prove fill path.
