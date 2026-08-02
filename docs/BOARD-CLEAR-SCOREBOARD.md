# Board Clear Scoreboard

**Campaign:** Board Clear 2026-08-01  
**Law:** [`BOARD-CLEAR-CONSTITUTION-2026-08-01.md`](BOARD-CLEAR-CONSTITUTION-2026-08-01.md)  
**Plan:** [`BOARD-CLEAR-EXECUTION-PLAN-2026-08-01.md`](BOARD-CLEAR-EXECUTION-PLAN-2026-08-01.md)  
**Agent residual DAG:** [`BOARD-CLEAR-AGENT-BACKLOG-2026-08-02.md`](BOARD-CLEAR-AGENT-BACKLOG-2026-08-02.md)  
**Update rule:** same turn as every merge that moves a row.  
**Tip check:** `git log origin/main -1 --oneline`

**Campaign status:** `RUNNING`  
**Last scoreboard edit:** 2026-08-02 methodology v3 — tip truth after agent wave (#289–#349 family)  
**Known dirty:** human M1–M7 open; agent residual A-TRADE-MM-3 / A-UI-SUB / P5 ops / WS mock-E2E  
**Standards:** ENGINEERING-STANDARD + SUBAGENT-PROTOCOL + DECISION-AUTHORITY  
**Human hard owner:** **`@shehzad002`** — `docs/SHEHZAD-HARD-OWNERSHIP-2026-08-01.md` (M1–M7)

---

## Board (must all become Done or Cut)

| Row                              | Status   | Owner                    | Reality                                                                 | Next ship         | Proof     |
| -------------------------------- | -------- | ------------------------ | ----------------------------------------------------------------------- | ----------------- | --------- |
| web.terminal                     | **WIP**  | **AGENT P-UI**           | Hotkeys #337 + honesty #349 on main; sub-accounts + pro polish residual | A-UI-SUB → PRO    | #337 #349 |
| ws.gateway                       | **WIP**  | **AGENT P-WS**           | Private harden #336; live futures E2E waits M3 events                   | A-WS-MOCK-E2E     | #336      |
| pay.gateway (+ pay.* expand)     | **OPEN** | **HUMAN M1 shehzad002**  | Crypto rail done; card + Pay OS                                         | M1 / #346 babysit | —         |
| protocol.smart-accounts          | **OPEN** | **HUMAN M2 shehzad002**  | Deploy + audit package                                                  | M2 Protocol OS    | —         |
| protocol.amm (+ lending/escrow…) | **OPEN** | **HUMAN M2 shehzad002**  | After SA                                                                | M2 Protocol OS    | —         |
| trade.spot                       | **WIP**  | **AGENT P-TRADE-LIGHT**  | Candle job + honest OHLCV #345; ops/tracker residual                    | A-TRADE-SPOT-OPS  | #345      |
| trade.futures                    | **OPEN** | **HUMAN M3 shehzad002**  | Risk engine                                                             | M3                | —         |
| trade.mm-bot                     | **WIP**  | **AGENT P-TRADE-LIGHT**  | Recovery #338 + reseed #340; **mid port** residual                      | A-TRADE-MM-3      | #338 #340 |
| trade.otc                        | **OPEN** | **HUMAN M4 shehzad002**  | Real engine                                                             | M4                | —         |
| trade.copy                       | **OPEN** | **HUMAN M4 shehzad002**  | Real engine                                                             | M4                | —         |
| trade.algo                       | **OPEN** | **HUMAN M4 shehzad002**  | Real engine                                                             | M4                | —         |
| venue.aggregation                | **WIP**  | **AGENT P-TRADE-LIGHT**  | Mark fabric #344 default OFF; ops residual                              | A-TRADE-VENUE-OPS | #344      |
| order-route #289                 | **DONE** | **AGENT P-OR** → M7 open | Merged A-OR-1                                                           | —                 | #289      |
| Phase 5 bank money               | **OPEN** | **HUMAN M6 shehzad002**  | earn/cards/ramps                                                        | M6                | —         |
| Phase 5 academy/ops/agents       | **WIP**  | **AGENT P-P5-LIGHT**     | Curriculum #341; ops/agents residual                                    | A-P5-OPS/AGENTS   | #341      |
| identity sub-account money       | **OPEN** | **HUMAN M5 shehzad002**  | money graph                                                             | M5                | —         |

Status vocabulary: `OPEN` | `WIP` | `DONE` | `CUT` (§13)

---

## Locked Nitro decisions (do not reopen)

1. Protocol = deploy + audit package
2. All trade mountains (HARD human / LIGHT agent split holds)
3. Card required (sandbox OK)
4. Phase 5 included
5. #289 claimed — **DONE**

---

## Open campaign PRs

_Re-derive with `gh pr list` each session. Do not trust this table alone._

| PR          | Program | Status                    |
| ----------- | ------- | ------------------------- |
| _re-derive_ | —       | `gh pr list --state open` |

---

## Finish gate

Campaign complete only when every row is `DONE` or `CUT` and EXECUTION PLAN §7 checklist is checked.  
**Agent idle is forbidden while agent residual remains.** Human OPEN does not pause agent L0.
