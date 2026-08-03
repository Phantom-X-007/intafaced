# TRK-blueprint.attestations — research / spec pack

**Tracker id:** `blueprint.attestations`  
**Title:** On-chain rank attestations, zero PII (§19)  
**Module / phase:** `blueprint` · phase 4  
**Status on tip:** `ready` · **owner:** none  
**Depends on:** `blueprint.onboarding` · `protocol.smart-accounts`  
**Tip freeze:** `origin/main` @ `c6d9e89e` (re-derive before implement)  
**Pack type:** research only — no implement swarm; no money invention; no dual-edit of Denon open money PRs; no `features.mjs` edit.

---

## 1 · What “done” means (plain language)

1. Rank/allowed claims **attested on-chain** with **zero PII** (§19).
2. Third-party verify without identity leak.
3. Depends smart-accounts / protocol readiness.

## 2 · Current code state (tip `c6d9e89e`)

| Area                | Reality                                  |
| ------------------- | ---------------------------------------- |
| Attestation product | **Not complete** as titled               |
| Blueprint focus     | Onboarding/card/export/erase             |
| Protocol dep        | smart-accounts residual / hard-lane risk |

## 3 · Doctrine constraints

| Law      | Implication                              |
| -------- | ---------------------------------------- |
| §19      | Zero PII on-chain                        |
| Protocol | May be Shehzad babysit for contracts     |
| Honesty  | Off-chain rank ≠ attestation until wired |

## 4 · DoD sketch

- [ ] Claim schema (rank bands only)
- [ ] Contract + issuer key ops (Class X)
- [ ] Request/verify API
- [ ] Explorer/docs path

## 5 · Open questions

1. Who is issuer?
2. Revocation model.

## 6 · Estimated size

**L** with chain+ops. First PR: claim schema ADR — **S**.

## 7 · Related

- §19 doctrine, protocol.smart-accounts, svc-blueprint export

## 8 · Non-goals

- No PII in calldata.
- No Shehzad implement from pack.
