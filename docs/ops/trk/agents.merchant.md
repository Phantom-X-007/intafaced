# TRK-agents.merchant

**Title:** Merchant agent — approval-rate watch  
**Tracker:** `agents.merchant` · phase 5 · plane F · status `ready` · owner none  
**Depends on:** `agents.gateway` (done), `pay.routing` (**human / shehzad002**)  
**Tip freeze:** `origin/main` @ `b3d08931` (re-derive before implement)

## DoD (plain language)

A merchant (or ops principal) runs a **Merchant** agent that watches **rail
approval rates** and proposes routing changes under guardrails — never silently
rewires production rails. Proposals are audited; any apply path is
approval-gated. No fabricates rates when pay routing data is missing — refuse
honestly.

## Path on tip

| Area           | Location                                                                                |
| -------------- | --------------------------------------------------------------------------------------- |
| Runtime (done) | `services/svc-agents/` — same fleet runtime as Navigator                                |
| Pay routing    | `pay.routing` in tracker — **owner shehzad002**, HUMAN M1 expand                        |
| Pay today      | `services/svc-pay` preference-list routing; approval-rate engine **not** this residual  |
| Doctrine       | §8.2 v1 fleet includes Merchant Agent; smart routing table ties agent to routing engine |

**Tip residual:** agent registration + tools over **routing metrics APIs that
do not exist yet** as the smart router.

## Blocked by

| Blocker                   | Notes                                                        |
| ------------------------- | ------------------------------------------------------------ |
| **`pay.routing` Shehzad** | Hard dependency — agents babysit only on M1 expand           |
| Product law               | Who may run Merchant agent (merchant principal vs staff)     |
| Class X                   | Live rail credentials already Class X in pay                 |
| Money                     | Agent must not settle payouts; proposals only until law says |

## First PR size (if free)

**Blocked for implement until `pay.routing` exposes readable approval-rate /
candidate-route data.** After that: **S** — register `merchant` guardrail
(tools: `pay.routing.stats` read, `pay.routing.propose` write+approval), mock
stats fixture tests, no auto-apply. Do **not** dual-build routing inside agents.
