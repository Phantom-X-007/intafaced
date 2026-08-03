# TRK-ops.compliance

**Title:** Screening queues, geo-block, VPN/Tor detection  
**Tracker:** `ops.compliance` · module `core-ops` · phase 5 · status `ready` · owner none  
**Depends on:** `identity.kyc`  
**Tip freeze:** `origin/main` @ `04f9b1f2` (re-derive before implement)  
**Pack type:** thorough research upgrade (`docs/trk-research-pack-drain`) — no implement swarm; no money invention; no dual-edit Denon open money PRs; no `features.mjs` edit.

---

## 1 · What “done” means (plain language)

Access = jurisdiction matrix + screening list + optional network signals with honest status (empty list ≠ screened clean). Staff queues for review. VPN/Tor labeled fail-closed if enabled. Sanctions list **content** Class X.

## 2 · Current code state (tip `04f9b1f2`)

| Area                  | Reality                                                      |
| --------------------- | ------------------------------------------------------------ |
| Mechanism             | `packages/config` `screening.ts` + `jurisdiction.ts` + tests |
| Edge                  | Jurisdiction gates on procedures                             |
| Admin                 | `/jurisdiction` readout — not full review-queue product      |
| VPN/Tor product queue | Not completed as titled (re-verify)                          |
| Open work             | Path-check Denon screening/config PRs before edit            |

## 3 · Doctrine constraints

| Law          | Implication                                 |
| ------------ | ------------------------------------------- |
| Fail closed  | Undecidable → refuse money-path access      |
| Honesty      | Never claim screened when list unconfigured |
| Class X      | Real list content is counsel                |
| No dual-edit | Open screening-config PRs                   |

## 4 · DoD sketch (checkable — staged)

### Stage 1

- [ ] Staff queue + reason codes + audit log (who/when/why)

### Stage 2 (optional)

- [ ] VPN/Tor signal socket (§13) or cut from title
- [ ] Product law: block vs step-up vs flag

### Tracker `done` bar

Flip only when the title’s product promise is true in a real env — not when a stub route or empty skeleton merges.

## 5 · Open questions

1. Override authority.
2. Per-surface VPN policy.
3. Collision with open config PRs.

## 6 · Estimated size

| Slice               | Size                     |
| ------------------- | ------------------------ |
| Queue + audit       | **M**                    |
| VPN/Tor integration | **M–L** + Class X vendor |

## 7 · Related docs / code

- `packages/config/src/screening.ts`
- `packages/config/src/jurisdiction.ts`
- `apps/admin` jurisdiction page

## 8 · Explicit non-goals for this pack

- No shipping real sanctions lists as agent content.
- No weakening empty-list honesty tests.
