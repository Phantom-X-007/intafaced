# TRK-chain.governance

**Title:** Governance parameter handover  
**Tracker:** `chain.governance` · phase 5P · plane P · status `ready` (runtime **blocked**) · owner none  
**Depends on:** `chain.validators` · `token.governance` (**socket** — ballot only)  
**Tip freeze:** `origin/main` @ `c6d9e89e`  
**Pack type:** research only.  
**Ownership:** progressive decentralisation §17.2 P3; token ballot residual is **not** agent free invent of quorum. Agents babysit implement.

## DoD (plain language)

Chain **parameters** (fees, listing rules, module flags that matter on INTACHAIN) move from house multi-sig / admin to **IFC-weighted governance** with real outcomes: proposals can pass/fail by published quorum and thresholds, and **execution** actually changes chain or module config. A UI that only records votes without an executor is not handover.

## Path on tip

| Area                | Location                                                                                 |
| ------------------- | ---------------------------------------------------------------------------------------- |
| Doctrine            | §17.2 P3 · §4.3 governance · phase 5P                                                    |
| Ballot (Fiat Plane) | `services/svc-token` proposals/votes — **mounted**                                       |
| Outcome hole        | Tracker: `token.governance` is **socket** — no pass/reject/execute writer; no quorum job |
| Chain params        | **none** — no chain to hand over                                                         |

**Tip residual:** Users can cast stake-weighted ballots on some proposal kinds; **nothing executes**. Chain parameter handover cannot complete until (1) chain exists, (2) outcome engine exists with owner-set thresholds, (3) cross-service executors (listing → trade, fee_param → config, grant → ledger recipe) are designed without inventing money.

## Blocked by

| Blocker                                  | Notes                                                             |
| ---------------------------------------- | ----------------------------------------------------------------- |
| **chain.validators** / **chain.mainnet** | Handover target missing                                           |
| **token.governance socket**              | Quorum/threshold/executor are product law; agents must not invent |
| Class M / Class X                        | `grant` outcomes move value; prod governance keys                 |

## First PR size (if free)

**Not agent free craft.** First honest slice after law: document parameter list + which plane executes each; socket remains until Denon/Shehzad set numbers. Optional Class N: keep `token.governance` note accurate (already corrected 2026-08-03).
