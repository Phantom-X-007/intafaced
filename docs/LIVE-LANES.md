# LIVE LANES — multi-agent claims

**Rule:** No code edits until your lane is on this board. First claimer wins.  
**Active campaign:** **Board Clear** — law `docs/BOARD-CLEAR-CONSTITUTION-2026-08-01.md` · plan · scoreboard · NEXT · process loops · GO paste.  
**Human hard split:** [`docs/SHEHZAD-HARD-OWNERSHIP-2026-08-01.md`](SHEHZAD-HARD-OWNERSHIP-2026-08-01.md) — **`@shehzad002`** owns H-PAY / H-PROT / H-TRADE-HARD / H-P5-MONEY / H-ID-SUB.  
**Ownership law:** `docs/NITRO-OWNERSHIP-AND-DENON-DIRECTION-2026-07-31.md` (Board Clear supersedes product-law wait for campaign Done bars).  
**Parallel:** one owner per program; agents **must not** implement on HUMAN-CLAIMED rows.

| Lane id / program     | Owner session                         | Scope                                                                                          | Status                    | Do not touch                         |
| --------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------ |
| **board-clear-coord** | GO orchestrator chat                  | L0 loop, scoreboard, NEXT, babysit merges, fan-out **agent** programs only                     | **CLAIM ON GO**           | residual-only mode; invent done      |
| **P-UI**              | Nitro agents                          | web.terminal — **vendor shell :8090** (`vendor/**/05_Web_Front`), not apps/web                 | **AGENT**                 | apps/web as product; steal for human |
| **P-WS**              | Nitro agents                          | svc-ws private streams E2E (events from trade may wait on human futures)                       | **AGENT**                 | invent futures events                |
| **P-OR**              | Nitro agents                          | **#289** rebase/merge or absorb (CONFLICTING)                                                  | **AGENT**                 | leave orphan; dual-edit shehzad      |
| **P-TRADE-LIGHT**     | Nitro agents                          | mm-bot recovery/reseed/mid residual; spot OHLCV; venue mount                                   | **AGENT**                 | futures risk / otc / copy / algo     |
| **P-P5-LIGHT**        | Nitro agents                          | academy / ops thin / agents usefulness or §13                                                  | **AGENT**                 | bank earn/cards/ramps money          |
| **P-TRACK**           | coord or agents                       | tracker + Board Clear scoreboard docs                                                          | **AGENT**                 | lie on Done                          |
| **H-PAY**             | **shehzad002**                        | pay.gateway **card** + merchant + durable status (crypto rail stay green)                      | **HUMAN-CLAIMED**         | agent card recipes / steal pay       |
| **H-PROT**            | **shehzad002**                        | smart-accounts + amm deploy proof + audit packages                                             | **HUMAN-CLAIMED**         | agent SA/AMM product Done            |
| **H-TRADE-HARD**      | **shehzad002**                        | futures **risk** correctness; real OTC / copy / algo engines                                  | **HUMAN-CLAIMED**         | agent invent engines                 |
| **H-P5-MONEY**        | **shehzad002**                        | bank earn / cards / ramps money paths                                                          | **HUMAN-CLAIMED**         | agent bank money product             |
| **H-ID-SUB**          | **shehzad002**                        | identity sub-account **money routing** (UI selector remains P-UI after APIs)                   | **HUMAN-CLAIMED**         | agent invent money routing           |
| **H-OR-JAVA**         | **shehzad002** (after #289)           | vendor Java dual-book residual post-#289                                                       | **QUEUED**                | start before #289 closed             |
| denon-spine           | Phantom-X-007                         | feat/spine-*                                                                                   | hold                      | Nitro force-push                     |

## Hard bans

- Main checkout edits
- Double-build same paths without claim
- Fake candles / balances / factory addresses / CI green
- Mark tracker `done` without constitution Done bar + proof
- Residual-only “never finish rows” while Board Clear active
- **Agent implementation on any HUMAN-CLAIMED H-\* program** (babysit/comment only)
- **Human exclusive claim on P-UI / P-OR / board-clear-coord** (unless Nitro rewrites this board)

## Last board update

- **2026-08-01 shehzad hard ownership:** locked `@shehzad002` on H-PAY, H-PROT, H-TRADE-HARD, H-P5-MONEY, H-ID-SUB. Agents keep P-UI, P-OR #289, P-TRADE-LIGHT, P-WS, P-P5-LIGHT, coord. Full backlog: `docs/SHEHZAD-HARD-OWNERSHIP-2026-08-01.md`.
- **2026-08-01 preflight/mega:** Board Clear programs + #289 dirty first-class.
