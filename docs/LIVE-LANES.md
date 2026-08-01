# LIVE LANES — multi-agent claims

**Rule:** No code edits until your lane is on this board. First claimer wins.  
**Active campaign:** **Board Clear** — law `docs/BOARD-CLEAR-CONSTITUTION-2026-08-01.md` · **GO:** `docs/BOARD-CLEAR-AUTONOMOUS-RUN.md`.  
**Human hard mountains:** [`docs/SHEHZAD-HARD-OWNERSHIP-2026-08-01.md`](SHEHZAD-HARD-OWNERSHIP-2026-08-01.md) — **`@shehzad002`** M1–M7.  
**Ownership law:** `docs/NITRO-OWNERSHIP-AND-DENON-DIRECTION-2026-07-31.md`.  
**Parallel:** agents on AGENT rows only; **never implement HUMAN-CLAIMED**.

| Lane id / program        | Owner session               | Scope                                                          | Status            | Do not touch                      |
| ------------------------ | --------------------------- | -------------------------------------------------------------- | ----------------- | --------------------------------- |
| **board-clear-coord**    | Board Clear GO orchestrator | L0, scoreboard, NEXT, babysit, fan-out **agent** programs only | **RUNNING**       | residual-only; steal H-\*         |
| **P-UI**                 | Nitro agents                | vendor shell `:8090` craft/hotkeys/honesty                     | **AGENT**         | apps/web product; human exclusive |
| **P-WS**                 | Nitro agents                | svc-ws E2E (futures events may wait on human M3)               | **AGENT**         | invent futures events             |
| **P-OR**              | Board Clear GO · A-OR-1          | **#289** MERGED (`e29748f`) — H-OR-JAVA unblocked for shehzad         | **DONE**          | re-open orphan PR               |
| **P-TRADE-LIGHT**        | Nitro agents                | mm recovery/reseed/mid residual; spot OHLCV; venue mount       | **AGENT**         | futures risk / otc / copy / algo  |
| **P-P5-LIGHT**           | Nitro agents                | academy / ops thin / agents usefulness                         | **AGENT**         | bank earn/cards/ramps money       |
| **P-TRACK**              | coord / agents              | tracker + scoreboard honesty                                   | **AGENT**         | lie on Done                       |
| **H-PAY / M1**           | **shehzad002**              | Pay OS — card + merchant + pay.* expansion                     | **HUMAN-CLAIMED** | agent A-PAY / card recipes        |
| **H-PROT / M2**          | **shehzad002**              | Protocol OS — SA, AMM, lending, escrow, router, merchant       | **HUMAN-CLAIMED** | agent SA/AMM product              |
| **H-TRADE-HARD / M3–M4** | **shehzad002**              | Futures risk + real OTC/copy/algo                              | **HUMAN-CLAIMED** | agent invent engines              |
| **H-ID-SUB / M5**        | **shehzad002**              | Identity sub-account money graph                               | **HUMAN-CLAIMED** | agent invent money routing        |
| **H-P5-MONEY / M6**      | **shehzad002**              | Bank earn/cards/ramps/sovereign-card                           | **HUMAN-CLAIMED** | agent bank money                  |
| **H-OR-JAVA / M7**       | **shehzad002** (after #289) | Vendor Java dual-book residual                                 | **QUEUED**        | start before #289 closed          |
| denon-spine              | Phantom-X-007               | feat/spine-*                                                   | hold              | Nitro force-push                  |

## Hard bans

- Main checkout edits; double-build without claim
- Fake candles / balances / factory addresses / CI green
- Tracker Done without constitution Done bar + proof
- **Agent code on any HUMAN-CLAIMED M1–M7**
- **Docs PRs that reopen free agent P-PAY/P-PROT** (reject — see #334 hold)
- Human exclusive claim on P-UI / P-OR / coord

## Last board update

- **2026-08-01 v2 hard mountains:** shehzad M1–M7 big blocks (not micro tickets). GO coord + P-OR RUNNING. Agents never A-PAY/A-PROT.
- **2026-08-01 #333:** initial human/agent split.
- **2026-08-01 Board Clear GO:** campaign cooking; must obey SHEHZAD-HARD-OWNERSHIP on tip.
- **2026-08-01 A-OR-1 MERGED:** #289 squash-merged (`e29748f`). P-OR DONE. M7 free for shehzad002.
