# TRK-launch.token-factory

**Title:** ERC-20 deploy from audited templates  
**Tracker:** `launch.token-factory` · phase 5 · plane B · status `ready` · owner none  
**Depends on:** (none — SA dep removed 2026-07-30 on evidence)  
**Requires:** `services/svc-protocol/contracts/launch` · `services/svc-protocol/src/launch`  
**Tip freeze:** `origin/main` @ `c6d9e89e`  
**Pack type:** research only — **no implement** of protocol contracts by Nitro agents.  
**Ownership:** Shehzad **S-A7** (Launch / token factory honest). Agents babysit implement on `svc-protocol/**` contracts.

## DoD (plain language)

A creator gets **unsigned** deploy calldata for a fixed-supply ERC-20 from a **named, hash-pinned template**, predicts the CREATE2 address, and after they broadcast, the token at that address **is** the template (supply to recipient only; no mint/owner/pause/upgrade). `launch.status` reports `audited:true` only after a real audit package — never sold as live-audited while false. Factory not configured → typed refuse **before** inventing a fictional address.

## Path on tip

| Area                        | Location                                                                                                         |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Contracts                   | `services/svc-protocol/contracts/launch/` — `SovereignToken.sol`, `TokenFactory.sol`                             |
| Service                     | `services/svc-protocol/src/launch/` — address, params, build, router                                             |
| Surface                     | `launch.status` · `predictTokenAddress` · `buildTokenDeployment` · `tokenInfo`                                   |
| Proofs                      | `token-factory-onchain.test.ts` · `router-launch-live.test.ts`                                                   |
| Missing for title “audited” | Real audit artifact · `socket.contract-audit` · production factory address · `services/svc-launch` product shell |

**Tip residual (honest):** Code is **mounted and proven on dev chain** (CREATE2 agree, supply path, refuse zero factory, `audited:false` deliberate). **Not done** because: no real audit, no chain decision, no `svc-launch` product, no launch fee (Fiat ledger recipe), no instant market/LP (needs trade + `protocol.amm`).

## Blocked by

| Blocker                    | Notes                                                     |
| -------------------------- | --------------------------------------------------------- |
| **Audit (S-A7 / socket)**  | Title requires audited templates                          |
| **Chain decision**         | Dev chain ≠ production factory deployment                 |
| **protocol.amm** (Shehzad) | Seed pool / meme path depends later                       |
| **Shehzad M2 / S-A7**      | Implement residual on contracts = babysit only for agents |
| Not blocked for research   | This pack                                                 |

## First PR size (if free)

**Shehzad / protocol lane:** production factory deploy script + env, keep `audited:false` until audit package lands; optional fuzz/gas sockets. **Nitro agents:** Class N docs only (this pack). Do **not** flip tracker `done` without audit + real chain. Do **not** dual-edit open Shehzad protocol PRs.
