# TRK-launch.launchpad

**Title:** Presale / fair launch, vesting, staked allocation tiers  
**Tracker:** `launch.launchpad` · phase 5 · plane F · status `ready` · owner none  
**Depends on:** `launch.token-factory` · `token.staking` (done)  
**Tip freeze:** `origin/main` @ `c6d9e89e`  
**Pack type:** research only.  
**Ownership:** Product surface `svc-launch` §8.4; on-chain vesting/escrow intersects Shehzad launch honesty (S-A7 expand) + protocol escrow. Agents do not invent raise economics.

## DoD (plain language)

A project configures **presale or fair-launch** terms; contributions settle honestly (ledger recipes on Fiat Plane and/or contracts on Protocol Plane); **vesting** is enforced, not spreadsheet theatre; **allocation caps/windows** respect `token.stakeOf` tiers already defined in svc-token. Fail closed when factory, chain, or stake service unavailable — never invent fill of a raise.

## Path on tip

| Area                    | Location                                                                      |
| ----------------------- | ----------------------------------------------------------------------------- |
| Doctrine                | §8.4 svc-launch · coverage matrix Launch rows · §35 launch trust layer        |
| Stake tiers (done)      | `services/svc-token` staking · `launchpadAllocationTier` · internal stake API |
| Identity rank mirror    | `launchpadTier` on rank thresholds                                            |
| Token factory (partial) | `services/svc-protocol` launch — deploy only, no raise                        |
| Missing                 | `services/svc-launch/` · raise/vesting contracts · contribution recipes · UI  |

**Tip residual:** Stake **gating data** exists. **No** raise engine, no vesting contract, no svc-launch service, no house raise fee recipe.

## Blocked by

| Blocker                           | Notes                                                  |
| --------------------------------- | ------------------------------------------------------ |
| **launch.token-factory** residual | Audited/production factory for on-chain leg            |
| **Money recipes**                 | Contributions/fees = ledger; Class M design            |
| **Product law**                   | Vesting schedules, refund rules, dispute — Denon/owner |
| Shehzad                           | Contract vesting/escrow if on protocol plane           |
| Class X                           | Jurisdictional offer law for public raises             |

## First PR size (if free)

**Scaffold only after law:** `svc-launch` skeleton + read models for “no active raise” honest empty. **Do not** ship contribution acceptance without ledger recipes + tests. Prefer protocol vesting contracts under Shehzad lane, Fiat contribution under Class M second-pass.
