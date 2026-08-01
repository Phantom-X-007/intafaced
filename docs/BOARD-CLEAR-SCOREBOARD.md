# Board Clear Scoreboard

**Campaign:** Board Clear 2026-08-01  
**Law:** [`BOARD-CLEAR-CONSTITUTION-2026-08-01.md`](BOARD-CLEAR-CONSTITUTION-2026-08-01.md)  
**Plan:** [`BOARD-CLEAR-EXECUTION-PLAN-2026-08-01.md`](BOARD-CLEAR-EXECUTION-PLAN-2026-08-01.md)  
**Update rule:** same turn as every merge that moves a row.  
**Tip check:** `git log origin/main -1 --oneline`

**Campaign status:** `HUMAN SPLIT LOCKED — awaiting GO`  
**Last scoreboard edit:** 2026-08-01 shehzad hard ownership · after GO → `RUNNING` · all Done/Cut → `COMPLETE`  
**Known dirty:** #289 CONFLICTING — **P-OR agent** rebase first-class  
**Standards:** ENGINEERING-STANDARD + SUBAGENT-PROTOCOL binding  
**Human hard owner:** **`@shehzad002`** — full backlog `docs/SHEHZAD-HARD-OWNERSHIP-2026-08-01.md`

---

## Board (must all become Done or Cut)

| Row                             | Status   | Owner                         | Reality                                              | Next ship              | Proof |
| ------------------------------- | -------- | ----------------------------- | ---------------------------------------------------- | ---------------------- | ----- |
| web.terminal                    | **OPEN** | **AGENT P-UI**                | Charts/equity on main; hotkeys/sub-accounts missing  | A-UI-1                 | —     |
| ws.gateway                      | **OPEN** | **AGENT P-WS**                | Position events partial; E2E incomplete              | A-WS-1 → B-WS-2        | —     |
| pay.gateway                     | **OPEN** | **HUMAN shehzad002 H-PAY**    | Live crypto rails done; **card required**            | PAY-01…11              | —     |
| protocol.smart-accounts         | **OPEN** | **HUMAN shehzad002 H-PROT**   | Code ready; need deploy + audit package              | PROT-01…05             | —     |
| protocol.amm                    | **OPEN** | **HUMAN shehzad002 H-PROT**   | Compile unblocked; need deploy proof after SA        | PROT-06…09             | —     |
| trade.spot                      | **OPEN** | **AGENT P-TRADE-LIGHT**       | REST solid; OHLCV empty-honest                       | A-TRADE-SPOT-1         | —     |
| trade.futures                   | **OPEN** | **HUMAN shehzad002 H-TRADE**  | Residual stack; jobs OFF; **risk** residual          | FUT-01…08              | —     |
| trade.mm-bot                    | **OPEN** | **AGENT P-TRADE-LIGHT**       | Seed+hold+fill on main; recovery/reseed/mid residual | A-TRADE-MM-1..3        | —     |
| trade.otc                       | **OPEN** | **HUMAN shehzad002 H-TRADE**  | Not product — **real engine**                        | OTC-01…04              | —     |
| trade.copy                      | **OPEN** | **HUMAN shehzad002 H-TRADE**  | Not product — **real engine**                        | COPY-01…04             | —     |
| trade.algo                      | **OPEN** | **HUMAN shehzad002 H-TRADE**  | Not product — **real engine**                        | ALGO-01…04             | —     |
| venue.aggregation               | **OPEN** | **AGENT P-TRADE-LIGHT**       | Fabric exists; not mounted                           | A-TRADE-VENUE-1        | —     |
| order-route #289                | **OPEN** | **AGENT P-OR** then H-OR-JAVA | Claimed; **CONFLICTING** — agent rebase first        | A-OR-1 → ORJ-\* later  | —     |
| Phase 5 bank money              | **OPEN** | **HUMAN shehzad002 H-P5-M**   | earn/cards/ramps                                     | BANK-01…03             | —     |
| Phase 5 academy/ops/agents      | **OPEN** | **AGENT P-P5-LIGHT**          | thin or §13                                          | A-P5-2..3              | —     |

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
