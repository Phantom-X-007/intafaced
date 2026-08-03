# TRK-chain.validators

**Title:** Validator set opening, published schedule  
**Tracker:** `chain.validators` · phase 5P · plane P · status `ready` (runtime **blocked** on `chain.mainnet`) · owner none  
**Depends on:** `chain.mainnet`  
**Tip freeze:** `origin/main` @ `c6d9e89e`  
**Pack type:** research only.  
**Ownership:** Shehzad **S-D3** (validator / staking architecture) + progressive decentralisation §17.2 P3. Agents babysit implement.

## DoD (plain language)

Validator membership is not “the house runs three boxes forever.” A **published schedule** opens the set (dates, criteria, stake thresholds), IFC staking secures the chain (real security budget, not APY theatre), and the public can verify who produces blocks and how to join. Decentralisation is dated roadmap, not a marketing word.

## Path on tip

| Area                            | Location                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------- |
| Doctrine                        | §17.2 P3 · §17.3 IFC staking · §21 phase **5P**                                 |
| Shehzad                         | S-D3 validator / staking architecture                                           |
| Fiat stake (not chain security) | `services/svc-token` `token.stakeOf` — gates products; **not** CometBFT bonding |
| Missing                         | `svc-chain` validator tooling · genesis validator set · schedule doc with force |

**Tip residual:** No validator set, no bonding, no schedule artifact. Ledger/token stake is a **product gate**, deliberately separate from chain security until S-D3 binds them honestly.

## Blocked by

| Blocker              | Notes                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| **chain.mainnet**    | No validators without a chain                                                                    |
| **S-D3 product law** | How IFC staking ties to security vs ledger stakeOf — must not double-count or invent slash rules |
| Class X              | Who may run validators; geo/sanctions on operators                                               |

## First PR size (if free)

**Docs:** published schedule draft + bonding economics ADR (owner-approved numbers only). **Code later:** genesis validator config in `svc-chain` for testnet with explicit “permissioned set; open date T+N” — never claim permissionless set before schedule fires.
