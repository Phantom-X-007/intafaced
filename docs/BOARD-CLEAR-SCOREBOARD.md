# Board Clear Scoreboard

**Campaign:** Board Clear 2026-08-01  
**Resume after compact:** **`docs/BOARD-CLEAR-NEXT.md` first** (agent self-serve — not Nitro)  
**AFK scope:** [`BOARD-CLEAR-AFK-CONTRACT.md`](BOARD-CLEAR-AFK-CONTRACT.md) — AGENT-COMPLETE vs BOARD-COMPLETE  
**Law:** [`BOARD-CLEAR-CONSTITUTION-2026-08-01.md`](BOARD-CLEAR-CONSTITUTION-2026-08-01.md)  
**Agent residual DAG:** [`BOARD-CLEAR-AGENT-BACKLOG-2026-08-02.md`](BOARD-CLEAR-AGENT-BACKLOG-2026-08-02.md)  
**Update rule:** same turn as every merge that moves a row.  
**Tip check:** `git log origin/main -1 --oneline`

**Campaign status:** `RUNNING`  
**Last scoreboard edit:** 2026-08-02 GO #356 MM-3 merged; next A-UI-SUB

**Authority:** For Board Clear status, **this file + NEXT beat** `docs/TRACKER.md` until tracker is resynced.  
**Known dirty:** human M1–M7 open; agent residual A-TRADE-MM-3 (exact next) then UI/P5/WS  
**Standards:** ENGINEERING-STANDARD + SUBAGENT-PROTOCOL + DECISION-AUTHORITY  
**Human hard owner:** **`@shehzad002`** — `docs/SHEHZAD-HARD-OWNERSHIP-2026-08-01.md` (M1–M7)

---

## Board (must all become Done or Cut)

| Row                              | Status   | Owner                    | Reality                                                         | Next ship         | Proof     |
| -------------------------------- | -------- | ------------------------ | --------------------------------------------------------------- | ----------------- | --------- |
| web.terminal                     | **WIP**  | **AGENT P-UI**           | Hotkeys #337 + honesty #349; sub-accounts + pro polish residual | A-UI-SUB → PRO    | #337 #349 |
| ws.gateway                       | **WIP**  | **AGENT P-WS**           | Private harden #336; live futures E2E waits M3                  | A-WS-MOCK-E2E     | #336      |
| pay.gateway (+ pay.* expand)     | **OPEN** | **HUMAN M1 shehzad002**  | Crypto rail done; card + Pay OS                                 | #346 babysit      | —         |
| protocol.smart-accounts          | **OPEN** | **HUMAN M2 shehzad002**  | Deploy + audit package                                          | M2                | —         |
| protocol.amm (+ lending/escrow…) | **OPEN** | **HUMAN M2 shehzad002**  | After SA                                                        | M2                | —         |
| trade.spot                       | **WIP**  | **AGENT P-TRADE-LIGHT**  | Candle job + honest OHLCV #345; ops residual                    | A-TRADE-SPOT-OPS  | #345      |
| trade.futures                    | **OPEN** | **HUMAN M3 shehzad002**  | Risk engine                                                     | M3                | —         |
| trade.mm-bot                     | **WIP**  | **AGENT P-TRADE-LIGHT**  | Recovery #338 + reseed #340; **mid port = exact next**          | **A-TRADE-MM-3**  | #338 #340 |
| trade.otc                        | **OPEN** | **HUMAN M4 shehzad002**  | Real engine                                                     | M4                | —         |
| trade.copy                       | **OPEN** | **HUMAN M4 shehzad002**  | Real engine                                                     | M4                | —         |
| trade.algo                       | **OPEN** | **HUMAN M4 shehzad002**  | Real engine                                                     | M4                | —         |
| venue.aggregation                | **WIP**  | **AGENT P-TRADE-LIGHT**  | Mark fabric #344 default OFF; ops residual                      | A-TRADE-VENUE-OPS | #344      |
| order-route #289                 | **DONE** | **AGENT P-OR** → M7 open | Merged A-OR-1                                                   | —                 | #289      |
| Phase 5 bank money               | **OPEN** | **HUMAN M6 shehzad002**  | earn/cards/ramps                                                | M6                | —         |
| Phase 5 academy/ops/agents       | **WIP**  | **AGENT P-P5-LIGHT**     | Curriculum #341; ops/agents residual                            | A-P5-OPS/AGENTS   | #341      |
| identity sub-account money       | **OPEN** | **HUMAN M5 shehzad002**  | money graph                                                     | M5                | —         |

Status vocabulary: `OPEN` | `WIP` | `DONE` | `CUT` (§13)

---

## Locked Nitro decisions (do not reopen)

1. Protocol = deploy + audit package
2. All trade mountains (HARD human / LIGHT agent)
3. Card required (sandbox OK)
4. Phase 5 included
5. #289 claimed — **DONE**

---

## Open campaign / adjacent PRs

_Live re-derive required every session. Snapshot at last scoreboard edit:_

| PR   | Program              | Status              |
| ---- | -------------------- | ------------------- |
| #346 | H-PAY M1 shehzad     | OPEN — babysit      |
| #350 | Denon copy-spec docs | OPEN — do not steal |

---

## Tracker demotion

`docs/TRACKER.md` may lag Board Clear merges. **Do not use TRACKER as Board Clear SoT** until a dedicated tracker-sync ship updates rows to match this scoreboard. Scoreboard + NEXT + git tip win any conflict.

---

## Finish gate

Campaign complete only when every row is `DONE` or `CUT` and EXECUTION PLAN §7 checklist is checked.  
Human OPEN ≠ agent idle.
