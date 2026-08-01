# Board Clear — Process Loops (mandatory)

**Without these loops, agents re-create residual theater.**  
Every ship and every orchestrator turn runs the loops below. Skipping is a campaign defect.

Homes: Constitution · Execution Plan · Scoreboard · Next · this file.

---

## L0 — Outer campaign loop (never exit until finished)

```
while scoreboard has any OPEN or WIP row:
  refresh: main tip, open PRs, scoreboard, NEXT
  babysit: red CI → fix → merge green
  if idle_ships: fan-out Wave A/B per ownership map
  if blocked_on_self: run replan loop P1
  if no_merge_and_no_pr_in_this_session_chunk:
      force: open next smallest ship PR or fix stuck PR
  write NEXT before any pause/compact/end-turn
  NEVER ask Nitro to continue
  NEVER exit with work remaining and NEXT empty
```

**Session end rule:** If context will compact or turn ends, last write is `BOARD-CLEAR-NEXT.md` with the exact next command/ship. Ending without NEXT = **failure**.

---

## L1 — Per-ship loop (R-S-P-B-V-M-U)

For **each** ship ID from the execution plan:

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

## L5 — Compaction / cold-start loop

```
1. Read UNSPOKEN-NEEDS → CONSTITUTION → PROCESS-LOOPS → EXECUTION-PLAN → SCOREBOARD → NEXT
2. git fetch; gh pr list; main tip
3. Resume exact NEXT step; if NEXT stale (>1 day and main moved), re-derive from scoreboard OPEN rows
4. Do not re-open locked B decisions
```

---

## L6 — Stall detector (self)

You are **stalling** if any is true:

- Explaining plan for >1 turn without opening worktree/PR
- Waiting for Nitro
- “Blocked” without §13 or alternate path
- Research notes with no ship ID
- Scoreboard unchanged after claimed work

**Unstall:** pick smallest OPEN ship → R1 immediately.

---

## L7 — Finish gate loop

```
for each constitution board row:
  assert DONE or CUT with proof link
run EXECUTION PLAN §7 checklist
if any fail → L0
if all pass → write SCOREBOARD campaign status COMPLETE; stop
```

Only then may the agent stop.
