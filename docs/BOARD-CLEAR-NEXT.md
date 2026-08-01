# Board Clear — NEXT

**Campaign status:** `PREFLIGHT PASSED — awaiting GO`  
**After GO:** set `RUNNING` and execute below.

## Immediate next (orchestrator)

1. Confirm main includes preflight PR (LIVE-LANES, ownership precedence, UI path, this audit).
2. On **GO**: claim `board-clear-coord` on LIVE-LANES.
3. Fan-out Wave A (parallel worktrees):
   - **P-OR:** rebase #289 onto main (CONFLICTING at preflight)
   - **P-TRADE:** A-TRADE-MM-1 recovery
   - **P-PAY:** A-PAY-1 card recipes
   - **P-UI:** A-UI-1 hotkeys on **vendor :8090**
   - **P-PROT:** A-PROT-1 SA proof path
4. Babysit CI; merge; update SCOREBOARD + this file every merge.
5. Loop L0 until all rows DONE/CUT.

## Do not

- Wait for Nitro
- Use apps/web as product UI
- Leave #289 orphan
- Obey residual ≤3 if it blocks Board Clear fan-out

## Last updated

2026-08-01 preflight audit — critical conflicts fixed.
