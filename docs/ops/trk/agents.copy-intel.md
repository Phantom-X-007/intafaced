# TRK-agents.copy-intel

**Title:** Copy-Intel — writes audited leader stats  
**Tracker:** `agents.copy-intel` · phase 5 · plane F · status `ready` · owner none  
**Depends on:** `agents.gateway` (done), `trade.copy` (**human / shehzad002**)  
**Tip freeze:** `origin/main` @ `b3d08931` (re-derive before implement)

## DoD (plain language)

Only the **Copy-Intel** job/agent may write **`audited_stats`** on copy leaders.
Until it runs, UI may show fill-derived stats but must not claim “audited.”
Writes are idempotent, replay-safe, and never invent performance. Profit-share
settlement stays on ledger recipes owned by copy trading — this agent audits
track record, it does not become a second money path.

## Path on tip

| Area           | Location                                                                          |
| -------------- | --------------------------------------------------------------------------------- |
| Doctrine       | Copy trading: `audited_stats` written **only** by svc-agents Copy-Intel           |
| Trade          | `trade.copy` — owner **shehzad002** HUMAN M4; schema residual (`copy_leaders`, …) |
| Trade README   | copy tables listed as not in spot PR                                              |
| Agents runtime | `services/svc-agents` ready; product agent **not** registered                     |
| Fleet phase    | Doctrine lists Copy-Intel as **v2** fleet (after Navigator/Support/…)             |

**Tip residual:** entire product. No `copy_leaders` / audited_stats writer on tip.

## Blocked by

| Blocker                  | Notes                                                          |
| ------------------------ | -------------------------------------------------------------- |
| **`trade.copy` Shehzad** | Cannot write audited_stats without leader rows and product law |
| Product law              | Stat schema, audit window, what “audited” means legally        |
| Money                    | Profit-share is copy/ledger — **do not invent** in this agent  |
| Soft                     | v2 ordering vs v1 fleet — may wait Navigator/Support first     |

## First PR size (if free)

**Blocked for implement until trade.copy defines `copy_leaders.audited_stats`
and fill sources.** After that: **S** — batch job or agent session that
recomputes stats from fills into audited_stats with version/idempotency, tests
that non-Copy-Intel writers are refused (DB privilege or API gate). No UI claim
of audited until job proves. Babysit Shehzad copy PR; do not implement copy
product in agents.
