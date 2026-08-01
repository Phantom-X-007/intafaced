# Board Clear — NEXT (always overwrite; never empty while campaign open)

**Rule:** Last agent action of every turn updates this file. Compaction recovery starts here.

## Campaign status

`SPEC+PROCESS READY` — execution not complete. After user says **GO**, status becomes `RUNNING` until scoreboard COMPLETE.

## Immediate next actions (ordered)

1. **Confirm main has** Board Clear docs (`BOARD-CLEAR-CONSTITUTION*`, PROCESS-LOOPS, this file). If not, merge autonomy-harden PR first.
2. **User/orchestrator GO** → set status RUNNING.
3. **Babysit** any open campaign PRs to green merge.
4. **Fan-out Wave A** (max parallel, separate worktrees) — priority:
   - A-TRADE-MM-1 (event recovery)
   - A-PAY-1 (card recipes)
   - A-UI-1 (hotkeys)
   - A-PROT-1 (SA proof/deploy path)
   - A-OR-1 (#289 triage)
5. After each merge: update `BOARD-CLEAR-SCOREBOARD.md` + this file.

## Do not

- Wait for Nitro
- Re-open locked B decisions
- Exit with OPEN rows and empty next list

## Last updated

2026-08-01 — autonomy harden (process loops + unspoken needs).  
Tip: re-check `git log origin/main -1`.
