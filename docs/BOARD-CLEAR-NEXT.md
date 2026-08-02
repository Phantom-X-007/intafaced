# Board Clear — NEXT

> **READ THIS FIRST AFTER COMPACT / continue.** Agent self-resumes.  
> Never chat summary · TRACKER.md · WAVE-AUDIT as live SoT.  
> **Parallel law:** `docs/BOARD-CLEAR-PARALLEL-SESSIONS.md`  
> Authority: (1) this file → (2) fetch + `gh pr list` → (3) SCOREBOARD + AGENT-BACKLOG → (4) freezes.

**Campaign status:** `RUNNING`  
**AFK:** `docs/BOARD-CLEAR-AFK-CONTRACT.md`  
**Tip when last acted:** `d519b87` fix(app): B2 terminal density (#368) — re-check every turn

---

## EXACT NEXT SHIP (do this now — single primary)

| Field               | Value                                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Ship ID**         | **A-TRADE-SPOT-OPS**                                                                                            |
| **Program**         | P-TRADE-LIGHT                                                                                                   |
| **Objective**       | Spot candle ops doc + enable-path honesty (job default OFF; no invent candles)                                  |
| **PATHS_ONLY**      | Prefer `services/svc-trade/README.md` + ops notes under trade; **avoid** files in open order-route PRs          |
| **Collision check** | Re-run ritual: open #370 order-route — if path intersect, skip to **A-P5-AGENTS** or **A-UI-PRO** (non-overlap) |
| **Branch prefix**   | `feat/trade-spot-ops-`                                                                                          |
| **After merge**     | EXACT NEXT → **A-TRADE-VENUE-OPS** (same collision rule) → **A-P5-AGENTS** → **A-UI-PRO**                       |

**Secondary (only if primary blocked by parallel PR):** A-P5-AGENTS · A-UI-PRO · babysit green agent PRs

---

## Pre-code ritual (every continue — mandatory)

```
git fetch origin main && git log origin/main -1 --oneline   → update Tip when last acted
gh pr list --state open
path-intersect EXACT NEXT with open PRs? → skip to non-overlapping secondary
LIVE-LANES claim program if free
worktree from tip → ship → green CI → merge → rewrite this file
```

---

## Open PRs (snapshot — re-derive)

| PR   | Owner      | Note                                                     |
| ---- | ---------- | -------------------------------------------------------- |
| #370 | parallel   | order-route CX-8 — **do not dual-edit trade chaos/seed** |
| #346 | shehzad002 | M1 pay CONFLICTING — babysit only                        |
| #350 | Denon      | copy-spec docs — no dual-edit                            |

---

## Shipped this GO wave

#356 MM-3 · #357 WS mock-E2E · #358 sub-accounts · #360 ops · #367 a11y · #359/#365 order-route residual · #368 frontend density (other stream)

## Freezes

M1–M7 no implement · invent ban · apps/web ban · no dual-build same paths · no wait-for-shehzad

## Last updated

2026-08-02 parallel-session harden — tip+PR ritual; EXACT NEXT = A-TRADE-SPOT-OPS with #370 collision rule.
