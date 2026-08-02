# Board Clear — Process Loops (mandatory)

**Without these loops, agents re-create residual theater.**  
Every ship and every orchestrator turn runs the loops below. Skipping is a campaign defect.

Homes: Constitution · Execution Plan · Agent backlog · Decision authority · Scoreboard · Next · this file.

---

## L0 — Outer campaign loop (never exit until finished)

```
while true:
  refresh: main tip, open PRs, scoreboard, NEXT, agent backlog SHIPPED ids
  babysit: red CI → fix → merge green (DECISION-AUTHORITY)
  if agent_residual_open:
      fan-out AGENT-BACKLOG priority; queue any X1–X5 to HUMAN-BLOCKERS (no Nitro ping)
  elif agent rows not all Done/Cut:
      polish / §13 agent rows / tests (PHASE B)
  elif human rows OPEN or HUMAN-BLOCKERS non-empty:
      PHASE C: finalize HUMAN-BLOCKERS; report Nitro once; stop agent implement
  else:
      BOARD-COMPLETE; stop
  if blocked_on_self: replan P1
  if no_merge_and_no_pr_in_this_session_chunk and agent residual:
      force: next smallest agent ship PR
  write NEXT before any pause/compact/end-turn
  NEVER ask Nitro to continue or re-read after compact
  NEVER treat human OPEN as a stop for agent cooking
```

**Session end rule:** If context will compact or turn ends, last write is `BOARD-CLEAR-NEXT.md` with the exact next command/ship. Ending without NEXT = **failure**.

---

## L1 — Per-ship loop (R-S-P-B-V-M-U)

For **each** ship ID from the **agent backlog** (preferred) or execution plan:

| Step    | Name     | Must produce                                                                                                                 |
| ------- | -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **R1**  | Research | Written notes: law cites, existing code paths, prior PRs, bans. Min 1 file read of SoT + 1 code grep. No code until R1 done. |
| **S1**  | Spec     | Acceptance bullets in PR draft = Done bar slice. “How we know” tests named.                                                  |
| **P1**  | Plan     | File list + order of commits + risk (money? invent?). ≤15 lines.                                                             |
| **B1**  | Build    | Worktree; surgical code; match repo style.                                                                                   |
| **V1**  | Verify   | Tests / package verify / CI. Real output. Money path: failure cases.                                                         |
| **RV1** | Review   | Adversarial self-check: invent? stranded funds? tracker lie? scope creep?                                                    |
| **M1**  | Merge    | Green CI + Class M self-audit if money; squash-merge.                                                                        |
| **U1**  | Update   | Scoreboard + tracker + NEXT same turn.                                                                                       |

**Anti-research-forever:** R1 max ~1 focused session chunk; then S1/B1. Research-only PRs only if they unlock multiple ships (rare).

**Anti-partial-forever:** After **3 merged ships** on the same board row without Done/Cut, next ship **must** either clear the Done bar or open §13 Cut with tracker honesty. No fourth “almost.”

---

## L2 — Parallel coordinator loop

```
every orchestrator cycle:
  map programs → running worktrees / open PRs
  if two agents touch same path → stop one, reassign
  prefer merge order: contracts → ledger recipes → service wire → UI
  never exceed safe parallel: default ≤5 code PRs open; babysit before opening more
  CI thrift: local verify before push storms
```

---

## L3 — Quality loop (every money or protocol ship)

1. Doctrine §0 check (ledger, no invent, no cross-SQL)
2. Idempotency / crash stranding question answered in PR
3. Failure tests if new recipe
4. Self-audit Class M block in PR body
5. If protocol: deploy proof path + audit package section

Fail any → do not merge.

---

## L4 — Replan loop (when reality breaks the plan)

Triggers: CI architecture conflict, Done bar impossible without invent, Denon main collision, secret class absent, #289 explosion.

```
1. Write what broke (1 paragraph in NEXT or plan addendum)
2. Choose: rewrite Done bar + §13 | split ship | change order | sandbox proof
3. Patch EXECUTION PLAN or SCOREBOARD
4. Resume L0 — never wait for Nitro
```

---

## L5 — Compaction / cold-start / CONTINUE loop

```
1. Open docs/BOARD-CLEAR-NEXT.md FIRST (EXACT NEXT SHIP) — never chat summary
2. git fetch; gh pr list; main tip
3. If NEXT ship already merged on tip → pick next OPEN agent ship from AGENT-BACKLOG; rewrite NEXT same turn
4. SCOREBOARD for row status; never TRACKER.md / WAVE-AUDIT-LATEST as SoT if older than tip
5. Do not re-open locked B; do not re-ship SHIPPED backlog IDs
6. Decision default: DECISION-AUTHORITY (agent acts; X1–X5 only to Nitro)
```

---

## L6 — Stall detector (self)

You are **stalling** if any is true:

- Explaining plan for >1 turn without opening worktree/PR
- Waiting for Nitro
- Waiting for shehzad before cooking **agent** residual
- “Blocked” without §13 or alternate path
- Research notes with no ship ID
- Re-opening shipped Wave A IDs as primary work
- Scoreboard unchanged after claimed work

**Unstall:** pick smallest unblocked **agent** ship from backlog → R1 immediately.  
If no agent residual: babysit human PRs + pro-trader polish under design bar.

---

## L7 — Finish gate loop

```
for each constitution board row:
  assert DONE or CUT with proof link + evidence
run EXECUTION PLAN §7 checklist
if any fail → L0
if all pass → write SCOREBOARD campaign status COMPLETE; stop
```

Only then may the agent stop.

---

## L8 — Anti-slop / evidence gate (every ship)

Before merge:

1. Run `docs/BOARD-CLEAR-ENGINEERING-STANDARD.md` anti-slop catalog against the PR
2. Evidence block present (commands + exit)
3. Invent check clean
4. RV1 adversarial: would an elite reviewer reject this? if yes, fix

Fail any → do not merge.

---

## L9 — Wave quality heartbeat

Every **4 merged product ships**:

1. Overwrite `docs/BOARD-CLEAR-WAVE-AUDIT-LATEST.md`
2. Sample PRs for slop
3. Confirm scoreboard ≡ tracker
4. Resume L0

Not a stop for Nitro.
