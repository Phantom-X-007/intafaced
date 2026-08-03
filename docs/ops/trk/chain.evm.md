# TRK-chain.evm

**Title:** INTAEVM sharing validator set + state  
**Tracker:** `chain.evm` · phase 4P · plane P · status `ready` (runtime **blocked** on `chain.mainnet`) · owner none  
**Depends on:** `chain.mainnet`  
**Tip freeze:** `origin/main` @ `c6d9e89e`  
**Pack type:** research only.  
**Ownership:** follows INTACHAIN long path (Shehzad Tier D). Agents babysit implement.

## DoD (plain language)

An **EVM execution environment** secured by the **same validator set** as INTACORE, reading shared chain state so builders deploy Solidity against platform liquidity without a separate trust root. Not “we pointed viem at someone else’s L2” alone — that is P0 rails, not INTAEVM.

## Path on tip

| Area                  | Location                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------- |
| Doctrine              | §17.1 INTAEVM · §21 phase 4P                                                             |
| EVM client used today | `services/svc-protocol/src/chain/client.ts` (read-only PublicClient; no chain ownership) |
| Deploy tooling        | `services/svc-protocol/scripts/deploy-dev.ts` (dev / configured RPC)                     |
| Missing               | EVM module on INTACHAIN; shared state bridge to CLOB module                              |

**Tip residual:** Protocol suite talks to **external EVM JSON-RPC**. There is no INTAEVM module, no shared validator set with a native CLOB, no `svc-chain` EVM ops.

## Blocked by

| Blocker            | Notes                                                            |
| ------------------ | ---------------------------------------------------------------- |
| **chain.mainnet**  | Hard dep — no EVM module without base chain                      |
| P0 vs P1 confusion | Deploying TokenFactory on Base/Arbitrum/etc. is P0, not this row |
| Shehzad sequencing | S-D\* after P0 contracts real                                    |

## First PR size (if free)

**After chain.mainnet testnet:** EVM module enablement + smoke deploy of existing `SovereignToken`/`TokenFactory` artifacts to **that** chain id, with `launch.status` reporting the real chain. **Not** a Nitro free craft PR while mainnet row is vapor.
