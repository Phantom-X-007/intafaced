# TRK-agents.support

**Title:** Support agent — KB + account-state grounded  
**Tracker:** `agents.support` · phase 5 · plane F · status `ready` · owner none  
**Depends on:** `agents.gateway` (done)  
**Tip freeze:** `origin/main` @ `c773dafa` (re-derive before implement)  
**Pack type:** research only — no implement; no money invention; no `features.mjs` edit.

## DoD (plain language)

A user starts a Support agent session; the agent answers only from allowed tools
(KB + account-state reads) under a **snapshotted guardrail**; every action is
audited; spend meters through ledger `feeCharge` only. It never places trades,
moves balances, or invents account numbers. If KB/account tools are unavailable,
it refuses honestly rather than freelancing.

## Path on tip

| Area           | Location                                                                                  |
| -------------- | ----------------------------------------------------------------------------------------- |
| Runtime (done) | `services/svc-agents/` — gateway, sessions, guardrails, metering, audit                   |
| Product agent  | **Not registered** — process ships with **no** product agents                             |
| Explicit law   | README + `index.ts` + `useful-path.ts`: Navigator/Support/Scanner/… are **separate work** |
| KB dependency  | Overlaps `ops.support` — may need KB store first                                          |
| Account state  | Read via identity / ledger **projection** contracts — no local balance                    |

**Tip residual:** runtime complete (`openSession → think → act → settle`).
Support is product registration + tool drivers, not a second gateway.

## Blocked by

| Blocker         | Notes                                                                   |
| --------------- | ----------------------------------------------------------------------- |
| Soft block      | `ops.support` KB empty → agent has nothing grounded to cite             |
| Provider config | `AGENTS_UPSTREAM_*` vault — Class X secrets for live models             |
| Product law     | Which tools Support may call (refund? cancel order?) — Denon/Nitro      |
| Money           | Metering path exists; **no new money invention** — use existing recipes |

## First PR size (if free)

**S:** register Support `agentId` + guardrail (read-only tools: `kb.search`,
`account.summary` stubs that return typed empty/unavailable), session open →
think → refuse-on-missing-tool tests, no UI. Block any tool surface that can
move value until explicit law. Prefer after at least a seed KB or explicit
“ungrounded refuse” DoD acceptance.
