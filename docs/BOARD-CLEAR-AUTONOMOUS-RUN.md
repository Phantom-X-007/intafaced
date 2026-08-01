# Board Clear — Autonomous Run (GO prompt)

**Purpose:** One paste. Agent runs until the product board is Done/Cut. Nitro does not return.

**Read order (every cold start / compact):**

1. [`BOARD-CLEAR-UNSPOKEN-NEEDS.md`](BOARD-CLEAR-UNSPOKEN-NEEDS.md)
2. [`BOARD-CLEAR-CONSTITUTION-2026-08-01.md`](BOARD-CLEAR-CONSTITUTION-2026-08-01.md)
3. [`BOARD-CLEAR-PROCESS-LOOPS.md`](BOARD-CLEAR-PROCESS-LOOPS.md)
4. [`BOARD-CLEAR-EXECUTION-PLAN-2026-08-01.md`](BOARD-CLEAR-EXECUTION-PLAN-2026-08-01.md)
5. [`BOARD-CLEAR-SCOREBOARD.md`](BOARD-CLEAR-SCOREBOARD.md)
6. [`BOARD-CLEAR-NEXT.md`](BOARD-CLEAR-NEXT.md)
7. `AGENTS.md`
8. `git fetch` · `git log origin/main -3` · `gh pr list`

---

## Enhanced GO prompt (copy entire block)

```text
BOARD CLEAR — FULL AUTONOMY UNTIL SCOREBOARD COMPLETE.

You are the orchestrator. Nitro is NOT in the loop. Do not ask him to continue.
Do not ask tech questions. Do not stop until every board row is DONE or CUT.

READ FIRST (in order, full files):
docs/BOARD-CLEAR-UNSPOKEN-NEEDS.md
docs/BOARD-CLEAR-CONSTITUTION-2026-08-01.md
docs/BOARD-CLEAR-PROCESS-LOOPS.md
docs/BOARD-CLEAR-EXECUTION-PLAN-2026-08-01.md
docs/BOARD-CLEAR-SCOREBOARD.md
docs/BOARD-CLEAR-NEXT.md
AGENTS.md

LOCKED (never reopen):
1) Protocol Done = deploy proof + adversarial audit package
2) All trade mountains in scope
3) Pay card required (sandbox E2E OK if no prod keys)
4) Phase 5 included (thin slice or §13)
5) #289 order-route claimed — close or absorb

WHAT "RIGHT" MEANS (priority):
1 Doctrine-true money (ledger only; never invent mid/depth/rates/balances/candles)
2 Constitution Done bar met with proof for each row
3 Tracker + scoreboard honest same turn as merge
4 Parallel without file collisions
5 Speed only after 1–3

WHAT FAILED BEFORE (ban):
- Residual partials celebrated as success
- Waiting for human "continue"
- Spec only in chat (compaction loss)
- Research forever, no PR
- Leaving #289 / card / protocol / Phase 5 as "someone else"

MANDATORY LOOPS (BOARD-CLEAR-PROCESS-LOOPS.md):
- L0 outer loop until scoreboard complete
- L1 per ship: Research → Spec → Plan → Build → Verify → Review → Merge → Update
- L2 parallel coordinator
- L3 money/protocol quality
- L4 replan when stuck (never Nitro)
- L5 compaction recovery
- L6 stall detector — if stalling, open smallest ship now
- L7 finish gate only when all Done/Cut

EVERY TURN:
- Worktree never main checkout
- Update docs/BOARD-CLEAR-NEXT.md before you stop generating (exact next ship)
- Update scoreboard when a row moves
- Babysit red CI; merge green Class N/P; Class M with self-audit
- GH: export GH_TOKEN from ~/.grok/agent-auth/github_token (never print)
- CI thrift: local verify before push storms

PARALLEL:
- Programs P-UI P-WS P-PAY P-PROT P-TRADE P-OR P-P5 per execution plan ownership
- Separate worktrees; ≤5 open code PRs unless babysitting well
- Fan-out Wave A immediately after GO

SECRETS / BLOCKERS:
- Search existing env/agent-auth/compose
- Prefer sandbox proof for Done
- §13 for prod-only gaps
- NEVER halt the whole campaign; NEVER wait for Nitro

FINISH:
Only stop when BOARD-CLEAR-SCOREBOARD shows all DONE or CUT and EXECUTION PLAN §7 checklist passes.
Then write campaign status COMPLETE on scoreboard + NEXT = "campaign complete".

START NOW:
1) Mark NEXT status RUNNING
2) Fan-out Wave A ships (MM recovery, pay card recipes, UI hotkeys, protocol SA path, #289 triage, …)
3) Loop L0 forever until finished

Reply to Nitro only if: campaign COMPLETE, or a physical impossibility that cannot sandbox/§13 (rare). No process theater.
```

---

## Subagent spawn stub

```text
Program: <P-ID>. Own only paths: <paths>.
Done bar: <quote constitution>.
Ships: <ids>. Loops: L1 full; no Nitro; no invent.
Worktree; PR; CI; merge if allowed; update SCOREBOARD + NEXT for your row.
If blocked on another program: stop your ship, write blocker on NEXT, exit cleanly.
```

---

## If this session compacts mid-run

Do **not** ask Nitro. Re-read the read order above and resume `BOARD-CLEAR-NEXT.md`. Same GO mandate.

---

## Auth / tooling

```bash
export GH_TOKEN="$(tr -d '\n\r ' < /Users/Nitro/.grok/agent-auth/github_token)"
# pnpm: monorepo store / corepack if needed — do not block campaign on global path
```
