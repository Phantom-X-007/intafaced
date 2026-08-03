# TRK-blueprint.attestations

**Title:** On-chain rank attestations, zero PII (§19)  
**Tracker:** `blueprint.attestations` · module `blueprint` · phase 4 · status `ready` · owner none  
**Depends on:** `blueprint.onboarding` · `protocol.smart-accounts`  
**Tip freeze:** `origin/main` @ `04f9b1f2` (re-derive before implement)  
**Pack type:** thorough research upgrade (`docs/trk-research-pack-drain`) — no implement swarm; no money invention; no dual-edit Denon open money PRs; no `features.mjs` edit.

---

## 1 · What “done” means (plain language)

1. Rank/allowed claims **attested on-chain** with **zero PII** (§19).
2. Third-party verify without identity leak.
3. Depends smart-accounts / protocol readiness.

## 2 · Current code state (tip `04f9b1f2`)

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

## 4 · DoD sketch (checkable — staged)

### DoD checks

- [ ] Claim schema (rank bands only)
- [ ] Contract + issuer key ops (Class X)
- [ ] Request/verify API
- [ ] Explorer/docs path

### Tracker `done` bar

Flip only when the title’s product promise is true in a real env — not when a stub route or empty skeleton merges.

## 5 · Open questions

1. Who is issuer?
2. Revocation model.

## 6 · Estimated size

| Slice            | Size                 |
| ---------------- | -------------------- |
| Claim schema ADR | **S**                |
| Full attestation | **L** with chain+ops |

## 7 · Related docs / code

- §19 doctrine
- protocol.smart-accounts
- svc-blueprint export

## 8 · Explicit non-goals for this pack

- No PII in calldata.
- No Shehzad implement from pack.
