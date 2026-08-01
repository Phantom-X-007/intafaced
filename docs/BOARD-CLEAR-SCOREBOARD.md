# Board Clear Scoreboard

**Campaign:** Board Clear 2026-08-01  
**Law:** [`BOARD-CLEAR-CONSTITUTION-2026-08-01.md`](BOARD-CLEAR-CONSTITUTION-2026-08-01.md)  
**Plan:** [`BOARD-CLEAR-EXECUTION-PLAN-2026-08-01.md`](BOARD-CLEAR-EXECUTION-PLAN-2026-08-01.md)  
**Update rule:** same turn as every merge that moves a row.  
**Tip check:** `git log origin/main -1 --oneline`

**Campaign status:** `RUNNING`  
**Last scoreboard edit:** 2026-08-01 wave2 #340–#344 on main; #345 CI · prior: 2026-08-01 wave1 audit after #289+#336+#337+#338 · prior: 2026-08-01 #289+#336+#337 on main; #338 CI; wave count 3  
**Known dirty:** #338 mm recovery in CI; human M1–M7 open  
**Standards:** ENGINEERING-STANDARD + SUBAGENT-PROTOCOL binding  
**Human hard owner:** **`@shehzad002`** — big mountains `docs/SHEHZAD-HARD-OWNERSHIP-2026-08-01.md` (M1–M7)

---

## Board (must all become Done or Cut)

| Row                              | Status   | Owner                    | Reality                                                      | Next ship           | Proof     |
| -------------------------------- | -------- | ------------------------ | ------------------------------------------------------------ | ------------------- | --------- |
| web.terminal                     | **WIP**  | **AGENT P-UI**           | Hotkeys A-UI-1 on main (#337); sub-accounts/honesty residual | A-UI-2/3            | #337      |
| ws.gateway                       | **WIP**  | **AGENT P-WS**           | A-WS-1 private harden on main (#336); B-WS-2 E2E residual    | B-WS-2              | #336      |
| pay.gateway (+ pay.* expand)     | **OPEN** | **HUMAN M1 shehzad002**  | Crypto rail done; **card + Pay OS**                          | M1 Pay OS           | —         |
| protocol.smart-accounts          | **OPEN** | **HUMAN M2 shehzad002**  | Code ready; deploy + audit package                           | M2 Protocol OS      | —         |
| protocol.amm (+ lending/escrow…) | **OPEN** | **HUMAN M2 shehzad002**  | Compile unblocked; suite after SA                            | M2 Protocol OS      | —         |
| trade.spot                       | **WIP**  | **AGENT P-TRADE-LIGHT**  | Candle job #345 rebasing; live OHLCV non-seeded              | A-TRADE-SPOT-1      | #345      |
| trade.futures                    | **OPEN** | **HUMAN M3 shehzad002**  | Jobs OFF residual; **risk engine**                           | M3 Derivatives risk | —         |
| trade.mm-bot                     | **WIP**  | **AGENT P-TRADE-LIGHT**  | Recovery+reseed on main (#338 #340); mid port residual       | A-TRADE-MM-3        | #338 #340 |
| trade.otc                        | **OPEN** | **HUMAN M4 shehzad002**  | Not product — **real engine**                                | M4 Desk engines     | —         |
| trade.copy                       | **OPEN** | **HUMAN M4 shehzad002**  | Not product — **real engine**                                | M4 Desk engines     | —         |
| trade.algo                       | **OPEN** | **HUMAN M4 shehzad002**  | Not product — **real engine**                                | M4 Desk engines     | —         |
| venue.aggregation                | **WIP**  | **AGENT P-TRADE-LIGHT**  | Venue mark fabric mounted (#344) default OFF                 | ops enable          | #344      |
| order-route #289                 | **DONE** | **AGENT P-OR** → M7 open | #289 merged A-OR-1 (`e29748f`)                               | complete            | #289      |
| Phase 5 bank money               | **OPEN** | **HUMAN M6 shehzad002**  | earn/cards/ramps/sovereign-card                              | M6 Bank money       | —         |
| Phase 5 academy/ops/agents       | **WIP**  | **AGENT P-P5-LIGHT**     | Curriculum thin on main (#341); ops/agents residual          | A-P5-3              | #341      |
| identity sub-account money       | **OPEN** | **HUMAN M5 shehzad002**  | money graph / no cross-leak                                  | M5 Identity money   | —         |

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
