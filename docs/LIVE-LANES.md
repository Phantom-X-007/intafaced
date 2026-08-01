# LIVE LANES — multi-agent claims

**Rule:** No code edits until your lane is on this board. First claimer wins.  
**Active campaign:** **Board Clear** — law `docs/BOARD-CLEAR-CONSTITUTION-2026-08-01.md` · plan · scoreboard · NEXT · process loops · GO paste.  
**Ownership law:** `docs/NITRO-OWNERSHIP-AND-DENON-DIRECTION-2026-07-31.md` (Board Clear supersedes product-law wait for campaign Done bars).  
**Parallel:** one agent (or non-overlapping sub-slice) per **program** below — not residual ≤3.

| Lane id / program     | Owner session        | Scope                                                                          | Status          | Do not touch                         |
| --------------------- | -------------------- | ------------------------------------------------------------------------------ | --------------- | ------------------------------------ |
| **board-clear-coord** | Board Clear GO orchestrator    | L0 loop, scoreboard, NEXT, babysit merges, fan-out                             | **RUNNING** | residual-only mode; invent done      |
| **P-UI**              | claim                | web.terminal — **vendor shell :8090** (`vendor/**/05_Web_Front`), not apps/web | free            | apps/web as product                  |
| **P-WS**              | claim                | svc-ws private streams E2E                                                     | free            | invent futures events                |
| **P-PAY**             | claim                | pay.gateway incl. **card** (sandbox OK)                                        | free            | Class X prod go-live as done         |
| **P-PROT**            | claim                | smart-accounts + amm deploy proof + audit packages                             | free            | force-push spine; prod RPC as live X |
| **P-TRADE**           | claim                | spot/futures/mm-bot/otc/copy/algo/venue Done bars                              | free            | invent mid/depth/rates/candles       |
| **P-OR**              | Board Clear GO · A-OR-1 | **#289** rebase/merge or absorb (was CONFLICTING)                              | **RUNNING** | leave orphan forever                 |
| **P-P5**              | claim                | bank/academy/ops/agents thin or §13                                            | free            | fake whole Phase 5 done              |
| **P-TRACK**           | coord or claim       | tracker + Board Clear scoreboard docs                                          | free            | lie on Done                          |
| denon-spine           | Phantom-X-007        | feat/spine-*                                                                   | hold            | Nitro force-push                     |

## Hard bans

- Main checkout edits
- Double-build same paths without claim
- Fake candles / balances / factory addresses / CI green
- Mark tracker `done` without constitution Done bar + proof
- Residual-only “never finish rows” while Board Clear active

## Last board update

- **2026-08-01 preflight:** LIVE-LANES rewritten for Board Clear programs. Residual-era lanes retired. UI = vendor :8090. #289 dirty → P-OR first-class.

- **2026-08-01 Board Clear GO:** `board-clear-coord` + **P-OR** RUNNING — A-OR-1 rebasing #289 onto main.
