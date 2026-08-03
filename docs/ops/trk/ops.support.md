# TRK-ops.support

**Title:** Support desk, tickets, KB  
**Tracker:** `ops.support` · phase 5 · plane F · status `ready` · owner none  
**Depends on:** `identity.accounts` (done)  
**Tip freeze:** `origin/main` @ `c6d9e89e` (re-derive before implement)  
**Pack type:** research only — no invent refund money; no `features.mjs` edit.  
**Ownership:** Core ops Fiat Plane. **Not** Shehzad M1–M7.

## DoD (plain language)

A user can open a support ticket; an operator can triage/resolve it; both can
search a knowledge base of **our** articles (no third-party product names in
user copy). Tickets never move money. Account-state shown to support is
read-only from identity/ledger projection APIs, not a second balance store.
Agent assist (see `agents.support`) is optional later — human desk works alone.

## Path on tip

| Area     | Location                                                                 |
| -------- | ------------------------------------------------------------------------ |
| Service  | **None** — no `svc-support`                                              |
| Related  | `services/svc-agents` runtime for future agent; `packages/i18n` for copy |
| UI       | No support desk route in `apps/web` / `apps/admin`                       |
| Doctrine | Core ops phase 5; admin may host operator queue later                    |

**Tip residual:** Greenfield. Incidental “ticket” strings in trading UI are
**order tickets**, not support tickets. Re-verified tip `c6d9e89e`: no
support desk service, schema, or admin queue.

## Blocked by

| Blocker             | Notes                                                                           |
| ------------------- | ------------------------------------------------------------------------------- |
| Product law / scope | Ticket model, SLA, which PII support may see — Denon or Nitro direction         |
| Unknown             | Whether KB is markdown-in-repo, CMS, or blueprint-adjacent                      |
| Optional money      | Refunds/chargebacks stay in pay/ledger — support only **requests**, never posts |

Not Shehzad M1–M7. **Do not invent refund recipes under this id.**

## First PR size (if free)

**M — contracts-first:** `packages/contracts` (+ events if needed) for ticket
create/list/comment + empty KB list; thin `svc-support` or slice under
`svc-identity` only if doctrine prefers one less service — **default new
service** if lifecycle is rich. First PR: schema + tRPC + tests, no UI, no
agent. Second PR: operator queue in `apps/admin`. User UI later.
