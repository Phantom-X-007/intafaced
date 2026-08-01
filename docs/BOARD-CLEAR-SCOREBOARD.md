# Board Clear Scoreboard

**Campaign:** Board Clear 2026-08-01  
**Law:** [`BOARD-CLEAR-CONSTITUTION-2026-08-01.md`](BOARD-CLEAR-CONSTITUTION-2026-08-01.md)  
**Plan:** [`BOARD-CLEAR-EXECUTION-PLAN-2026-08-01.md`](BOARD-CLEAR-EXECUTION-PLAN-2026-08-01.md)  
**Update rule:** same turn as every merge that moves a row.  
**Tip check:** `git log origin/main -1 --oneline`

**Campaign status:** `MEGA-HARDENED — awaiting GO`  
**Last scoreboard edit:** 2026-08-01 mega audit · after GO → `RUNNING` · all Done/Cut → `COMPLETE`  
**Known dirty:** #289 CONFLICTING — P-OR rebase first-class  
**Standards:** ENGINEERING-STANDARD + SUBAGENT-PROTOCOL binding

---

## Board (must all become Done or Cut)

| Row                             | Status   | Reality                                              | Next ship        | Proof |
| ------------------------------- | -------- | ---------------------------------------------------- | ---------------- | ----- |
| web.terminal                    | **OPEN** | Charts/equity on main; hotkeys/sub-accounts missing  | A-UI-1           | —     |
| ws.gateway                      | **OPEN** | Position events partial; E2E incomplete              | A-WS-1 → B-WS-2  | —     |
| pay.gateway                     | **OPEN** | Live crypto rails done; **card required**            | A-PAY-1          | —     |
| protocol.smart-accounts         | **OPEN** | Code ready; need deploy + audit package              | A-PROT-1..3      | —     |
| protocol.amm                    | **OPEN** | Compile unblocked; need deploy proof after SA        | B-PROT-4         | —     |
| trade.spot                      | **OPEN** | REST solid; OHLCV empty-honest                       | A-TRADE-SPOT-1   | —     |
| trade.futures                   | **OPEN** | Residual stack; jobs OFF; index residual             | A-TRADE-FUT-1..2 | —     |
| trade.mm-bot                    | **OPEN** | Seed+hold+fill on main; recovery/reseed/mid residual | A-TRADE-MM-1..3  | —     |
| trade.otc                       | **OPEN** | Not product                                          | A-TRADE-OTC-1    | —     |
| trade.copy                      | **OPEN** | Not product                                          | A-TRADE-COPY-1   | —     |
| trade.algo                      | **OPEN** | Not product                                          | A-TRADE-ALGO-1   | —     |
| venue.aggregation               | **OPEN** | Fabric exists; not mounted                           | A-TRADE-VENUE-1  | —     |
| order-route #289                | **OPEN** | Claimed; **CONFLICTING** vs main — rebase first      | A-OR-1           | —     |
| Phase 5 bank/academy/ops/agents | **OPEN** | Claimable                                            | A-P5-1..3        | —     |

Status vocabulary: `OPEN` | `WIP` | `DONE` | `CUT` (§13)

---

## Locked Nitro decisions (do not reopen)

1. Protocol = deploy + audit package
2. All trade mountains
3. Card required (sandbox OK)
4. Phase 5 included
5. #289 claimed

---

## Open campaign PRs

_Re-derive with `gh pr list` each session. Do not trust this table alone._

| PR                                      | Program | Status |
| --------------------------------------- | ------- | ------ |
| _(none for constitution until this PR)_ | P-TRACK | —      |

---

## Finish gate

Campaign complete only when every row is `DONE` or `CUT` and EXECUTION PLAN §7 checklist is checked.
