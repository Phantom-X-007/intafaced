# Board Clear — NEXT

> **READ THIS FIRST AFTER COMPACT / cold start.**  
> Do **not** open TRACKER.md or WAVE-AUDIT-LATEST as truth.  
> Do **not** continue from chat summary.  
> Authority rank: (1) this file → (2) `git fetch` + `gh pr list` → (3) SCOREBOARD + AGENT-BACKLOG → (4) constitution / shehzad / decision-authority.  
> Last tip when written: re-check `git log origin/main -1`.

**Campaign status:** `RUNNING`  
**AFK contract:** `docs/BOARD-CLEAR-AFK-CONTRACT.md` (AGENT-COMPLETE vs BOARD-COMPLETE)  
**Human blockers queue:** `docs/BOARD-CLEAR-HUMAN-BLOCKERS.md` (flush only after agent residual done)  
**Methodology:** v3.2 AFK · 2026-08-02  
**Agent backlog:** `docs/BOARD-CLEAR-AGENT-BACKLOG-2026-08-02.md`  
**Decisions:** `docs/BOARD-CLEAR-DECISION-AUTHORITY.md`  
**Scoreboard:** `docs/BOARD-CLEAR-SCOREBOARD.md`

---

## EXACT NEXT SHIP (do this now — single primary)

| Field | Value |
| --- | --- |
| **Ship ID** | **A-UI-SUB** |
| **Program** | P-UI |
| **Objective** | Sub-accounts selector on vendor shell; honest block if money routing incomplete (H-ID-SUB shehzad) |
| **PATHS_ONLY** | `vendor/**/05_Web_Front/**` |
| **Never touch** | invent balances/routing; apps/web; M1–M7 implement |
| **Branch / open PR** | prefer babysit **#358** if still open — else `feat/ui-sub-accounts-selector` |
| **Worktree** | Fresh from origin/main or existing board-clear-ui-sub |
| **Proof** | golden/tests + PR evidence |
| **After merge** | EXACT NEXT → **A-WS-MOCK-E2E** (#357) then **A-P5-OPS** (#360) |

**Secondary queue:** finish #357 A-WS-MOCK-E2E · #360 A-P5-OPS · A-UI-A11Y · A-TRADE-SPOT-OPS · A-TRADE-VENUE-OPS


## Session bootstrap (every compact / GO — **agent only**, never Nitro)

```
1. Read THIS file only for “what next” (agent self-resume after compact — do not ask Nitro)
2. git fetch origin main && git log origin/main -3 --oneline
3. gh pr list --state open
4. Skim SCOREBOARD + AGENT-BACKLOG (skip SHIPPED IDs)
5. Babysit open PRs per DECISION-AUTHORITY (#346 shehzad pay; #350 Denon docs — no steal)
6. Implement EXACT NEXT SHIP (or fix red CI on your open PR)
7. Before stop/compact: rewrite EXACT NEXT SHIP + open-PR notes in this file
8. If agent residual empty: PHASE C → HUMAN-BLOCKERS flush → report Nitro once
```

---

## Freezes / do-not-touch

- **Human M1–M7** (`SHEHZAD-HARD-OWNERSHIP`) — babysit only; never implement
- **apps/web** as product — ban
- **Invent** mid/depth/rates/balances/candles — ban
- **Re-ship** #289 / #336–#341 / #344–#345 / #349 as primary — ban
- **Locked B** decisions — ban reopen

---

## Open PRs (re-derive with `gh pr list`)

| PR | Owner | Note |
| --- | --- | --- |
| #358 | agent | A-UI-SUB — merge when green |
| #357 | agent | A-WS-MOCK-E2E — merge when green |
| #360 | agent | A-P5-OPS — merge when green |
| #346 | shehzad002 | M1 pay — CONFLICTING; babysit only |
| #350 | Denon | copy-spec docs |


## Shipped (do not primary-reopen)

#289 A-OR-1 · #336 A-WS-1 · #337 A-UI-1 · #338 MM-1 · #340 MM-2 · #341 curriculum · #344 venue · #345 candles · #349 UI honesty · #356 MM-3 mid port · #352 methodology v3 · #353 shehzad GitHub ownership lock

---

## Last updated

2026-08-02 GO: #356 A-TRADE-MM-3 MERGED; EXACT NEXT = A-UI-SUB (#358).
