# Board Clear — Autonomous Run (paste / forever)

**You do not wait for Nitro.** Compaction-safe entry. Read in order, then loop until finished.

---

## Cold start (every session / after compact)

```text
1) AGENTS.md + CLAUDE.md
2) docs/BOARD-CLEAR-CONSTITUTION-2026-08-01.md   ← law + Done bars + locked B decisions
3) docs/BOARD-CLEAR-EXECUTION-PLAN-2026-08-01.md ← ships + parallel programs
4) docs/BOARD-CLEAR-SCOREBOARD.md                ← live status (update every merge)
5) git fetch && git log origin/main -3 --oneline
6) gh pr list --state open
7) EXECUTE the forever loop in EXECUTION PLAN §4
```

GH auth if needed:

```bash
export GH_TOKEN="$(tr -d '\n\r ' < /Users/Nitro/.grok/agent-auth/github_token)"
```

pnpm may live in the monorepo store; do not block on missing global pnpm.

---

## Paste prompt (new chat / subagent orchestrator)

```text
BOARD CLEAR CAMPAIGN — FULL AUTONOMY. Nitro is NOT in the loop.

Read and obey:
- docs/BOARD-CLEAR-CONSTITUTION-2026-08-01.md
- docs/BOARD-CLEAR-EXECUTION-PLAN-2026-08-01.md
- docs/BOARD-CLEAR-SCOREBOARD.md
- AGENTS.md (worktrees, no main push, pnpm verify, money bans)

LOCKED DECISIONS (do not reopen):
1 Protocol Done = deploy proof + adversarial audit package (no waiting for external firm)
2 All trade mountains in scope
3 Pay card required (sandbox E2E OK)
4 Phase 5 included (thin slices or §13)
5 #289 order-route claimed

GOAL: Every board row Done or Cut+§13. Screenshot table must change. Residual partials alone = failure.

RULES:
- Spec/plan already in constitution+execution plan — execute ships; update plan only when reality forces replan
- Parallel programs per ownership map; separate worktrees; no file collisions
- Never invent mid/depth/rates/balances/candles
- Never ask Nitro tech questions; secrets missing → sandbox/§13 and continue
- Never stop for "continue?"; on compact re-read the three docs and resume
- Babysit CI; merge Class M with self-audit; Class N/P when green
- Same-turn tracker + scoreboard updates
- Quality bar = elite engineer + doctrine; no fake Done

START: Wave 0 complete if constitution on main; else land docs PR first. Then Wave A fan-out max parallel. Loop EXECUTION PLAN §4 until scoreboard complete.

Report to Nitro only: row flips to Done/Cut, true blockers that are physical (no secrets file exists and sandbox impossible), or campaign complete. No process narration.
```

---

## Subagent fan-out template

When spawning a program agent, include:

```text
You own program <P-ID> only. Paths: <list>.
Done bar: <quote constitution §3>.
Ships: <ship IDs from execution plan>.
Bans: constitution §4. Worktree only. PR + CI + merge if Class N/P/M self-audited.
Do not touch other programs' paths. Do not ask Nitro. If blocked on dep, stop that ship and report owner program.
Update docs/BOARD-CLEAR-SCOREBOARD.md for your row when ship merges.
```

---

## Compaction recovery (one line)

If you remember nothing: open **CONSTITUTION → EXECUTION PLAN → SCOREBOARD → main tip → open PRs → forever loop**. Goal is board Done, not residual theater.
