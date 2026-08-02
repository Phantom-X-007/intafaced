# Board Clear — NEXT

> **READ THIS FIRST AFTER COMPACT / cold start.**  
> Do **not** open TRACKER.md or WAVE-AUDIT-LATEST as truth.  
> Do **not** continue from chat summary.  
> Authority rank: (1) this file → (2) `git fetch` + `gh pr list` → (3) SCOREBOARD + AGENT-BACKLOG → (4) constitution / shehzad / decision-authority.  
> Last tip when written: re-check `git log origin/main -1`.

**Campaign status:** `RUNNING`  
**Methodology:** v3 + compaction-proof hygiene · 2026-08-02  
**Agent backlog:** `docs/BOARD-CLEAR-AGENT-BACKLOG-2026-08-02.md`  
**Decisions:** `docs/BOARD-CLEAR-DECISION-AUTHORITY.md`  
**Scoreboard:** `docs/BOARD-CLEAR-SCOREBOARD.md`

---

## EXACT NEXT SHIP (do this now — single primary)

| Field             | Value                                                                                                                       |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Ship ID**       | **A-TRADE-MM-3**                                                                                                            |
| **Program**       | P-TRADE-LIGHT                                                                                                               |
| **Objective**     | Mid **port** for mm seed: config + optional venue/oracle adapter; **never invent mid**; empty mid → skip seed               |
| **PATHS_ONLY**    | `services/svc-trade/src/mm/**` (+ env/index wire only if required for mid port)                                             |
| **Never touch**   | `futures/` risk math; otc/copy/algo; pay; protocol; vendor Java M7                                                          |
| **Branch prefix** | `feat/trade-mm-mid-`                                                                                                        |
| **Worktree**      | Create fresh from `origin/main` via `pnpm wt` / `git worktree add` — no sticky path                                         |
| **Proof**         | Unit tests: missing mid skips; configured mid seeds; no invent                                                              |
| **After merge**   | Flip scoreboard mm-bot next ship; set this file’s EXACT NEXT to **A-UI-SUB** (or first OPEN agent ship in backlog priority) |

**Secondary queue only after A-TRADE-MM-3 is PR-open or merged:** A-UI-SUB · A-P5-OPS · A-WS-MOCK-E2E · A-UI-A11Y · A-TRADE-SPOT-OPS · A-TRADE-VENUE-OPS (see backlog).

---

## Session bootstrap (every compact / GO)

```
1. Read THIS file only for “what next”
2. git fetch origin main && git log origin/main -3 --oneline
3. gh pr list --state open
4. Skim SCOREBOARD + AGENT-BACKLOG (skip SHIPPED IDs)
5. Babysit open PRs per DECISION-AUTHORITY (#346 shehzad pay; #350 Denon docs — no steal)
6. Implement EXACT NEXT SHIP (or fix red CI on your open PR)
7. Before stop/compact: rewrite EXACT NEXT SHIP + open-PR notes in this file
```

---

## Freezes / do-not-touch

- **Human M1–M7** (`SHEHZAD-HARD-OWNERSHIP`) — babysit only; never implement
- **apps/web** as product — ban
- **Invent** mid/depth/rates/balances/candles — ban
- **Re-ship** #289 / #336–#341 / #344–#345 / #349 as primary — ban
- **Locked B** decisions — ban reopen

---

## Open PRs (re-derived live when this file was last written)

| PR                                                          | Owner      | Note                                                       |
| ----------------------------------------------------------- | ---------- | ---------------------------------------------------------- |
| [#346](https://github.com/Phantom-X-007/intafaced/pull/346) | shehzad002 | M1 pay — babysit Class M; merge only if self-audit + green |
| [#350](https://github.com/Phantom-X-007/intafaced/pull/350) | Denon      | Copy-spec docs — do not dual-edit without claim            |

_Re-run `gh pr list` every session; replace this table if tip moved._

---

## Shipped (do not primary-reopen)

#289 A-OR-1 · #336 A-WS-1 · #337 A-UI-1 · #338 MM-1 · #340 MM-2 · #341 curriculum · #344 venue · #345 candles · #349 UI honesty · #352 methodology v3 · #353 shehzad GitHub ownership lock

---

## Last updated

2026-08-02 compaction-proof hygiene — EXACT NEXT = A-TRADE-MM-3; TRACKER/wave-audit demoted.
