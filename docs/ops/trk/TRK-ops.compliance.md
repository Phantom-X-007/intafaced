# TRK-ops.compliance — research / spec pack

**Tracker id:** `ops.compliance`  
**Title:** Screening queues, geo-block, VPN/Tor detection  
**Module / phase:** `core-ops` · phase 5  
**Status on tip:** `ready` · **owner:** none  
**Depends on:** `identity.kyc`  
**Tip freeze:** `origin/main` @ `c6d9e89e` (re-derive before implement)  
**Pack type:** research only — no implement swarm; no money invention; no dual-edit of Denon open money PRs; no `features.mjs` edit.

---

## 1 · What “done” means (plain language)

1. Access = jurisdiction matrix + screening list + optional network signals, with **honest status** (empty list ≠ “screened clean”).
2. Staff **queues** for review/appeal — not only silent deny.
3. VPN/Tor if enabled is labeled and fail-closed per product law.
4. Sanctions **list content** is Class X (counsel); eng ships mechanism.

## 2 · Current code state (tip `c6d9e89e`)

| Area                  | Reality                                                      |
| --------------------- | ------------------------------------------------------------ |
| Mechanism             | `packages/config` `screening.ts` + `jurisdiction.ts` + tests |
| Edge                  | Jurisdiction gates on procedures                             |
| Admin                 | `/jurisdiction` readout — not full review-queue product      |
| VPN/Tor product queue | Not a completed monorepo product (re-verify)                 |
| Open PRs              | Path-check Denon screening/config work before edit           |

## 3 · Doctrine constraints

| Law          | Implication                                 |
| ------------ | ------------------------------------------- |
| Fail closed  | Undecidable → refuse money-path access      |
| Honesty      | Never claim screened when list unconfigured |
| Class X      | Real list content                           |
| No dual-edit | Open screening-config PRs                   |

## 4 · DoD sketch (staged)

### Stage 1

- [ ] Staff queue + reason codes + audit log (who/when/why)

### Stage 2 (optional)

- [ ] VPN/Tor signal socket (§13) or cut from title
- [ ] Product law: block vs step-up vs flag

**Tracker `done`:** mechanism + queue + configured list path; list content is ongoing ops/counsel.

## 5 · Open questions

1. Override authority.
2. Per-surface VPN policy.
3. Collision with open config PRs.

## 6 · Estimated size

Queue+audit **M**; VPN **M–L** + Class X vendor.

**First PR:** queue on existing deny reasons — **M**.

## 7 · Related

- `packages/config/src/screening.ts`, `jurisdiction.ts`
- `apps/admin` jurisdiction page

## 8 · Non-goals

- No shipping real sanctions lists as agent content.
- No weakening empty-list honesty tests.
