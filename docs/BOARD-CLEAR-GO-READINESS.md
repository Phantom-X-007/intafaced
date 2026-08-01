# Board Clear — GO readiness

**Question:** Can Nitro say **GO** once and walk away until the board is Done/Cut?

---

## Green light: **YES — for process autonomy**

| Criterion                                    | Status                             |
| -------------------------------------------- | ---------------------------------- |
| Locked product decisions (B1–B5)             | **YES** — constitution             |
| Done bars per row                            | **YES** — constitution §3          |
| Parallel ownership map                       | **YES** — execution plan           |
| Wave / ship decomposition                    | **YES** — execution plan           |
| Unspoken needs explicit                      | **YES** — UNSPOKEN-NEEDS           |
| Research→spec→build→review loops             | **YES** — PROCESS-LOOPS            |
| Anti-stall / anti-partial-forever            | **YES** — L0 L1 L6                 |
| Compaction recovery                          | **YES** — L5 + NEXT + read order   |
| No “continue?” in mandate                    | **YES** — autonomous run prompt    |
| Scoreboard + NEXT homes                      | **YES**                            |
| Entry chain from START-HERE / session prompt | **YES** (this PR updates pointers) |
| Invent bans + money bans                     | **YES** — constitution + AGENTS    |
| #289 / card / Phase 5 / all trade in scope   | **YES**                            |

**Therefore:** Saying **GO** with the paste in `BOARD-CLEAR-AUTONOMOUS-RUN.md` is the correct action. Agents have enough law to finish without you.

---

## What green light does **not** claim

| Claim                                        | Reality                                                                           |
| -------------------------------------------- | --------------------------------------------------------------------------------- |
| Product already Done                         | **No** — execution still required                                                 |
| Zero risk of agent error                     | **No** — loops + review reduce it; CI is the net                                  |
| External audit firm sign-off without package | **No** — Done = deploy proof + **adversarial audit package**                      |
| Prod card keys always present                | **No** — sandbox E2E = Done if keys absent                                        |
| Chat window cannot die                       | **No** — on death, **new chat + same paste** resumes from NEXT (no new decisions) |
| Infinite free compute                        | **No** — thrift rules; still finish                                               |

---

## Your obligations after GO (minimal)

1. Paste GO prompt into an agent session with repo access.
2. If the **session dies**, open a new session and paste the **same** GO prompt again (not a weaker residual prompt).
3. Do **not** re-open B decisions.
4. Optional: check scoreboard later for COMPLETE — not required for agents to keep working.

You do **not** need to: run git, approve Denon PRs, answer tech forks, or say continue.

---

## Pre-GO checklist (orchestrator, 30 seconds)

- [ ] `origin/main` contains `docs/BOARD-CLEAR-PROCESS-LOOPS.md` and `BOARD-CLEAR-UNSPOKEN-NEEDS.md`
- [ ] `BOARD-CLEAR-NEXT.md` is non-empty
- [ ] GH token file exists for agents
- [ ] Paste is the **enhanced** block from AUTONOMOUS-RUN (not residual campaign prompt)

If all checked → **GO**.

---

## Verdict line for Nitro

**Green light: YES. Say GO. Use the enhanced paste. Board Clear process is complete enough to run without you; product finish is what the loop then executes.**
