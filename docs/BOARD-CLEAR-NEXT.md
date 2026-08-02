# Board Clear — NEXT

> **READ THIS FIRST AFTER COMPACT / continue.** Agent self-resumes.  
> Never chat summary · TRACKER.md · WAVE-AUDIT as live SoT.  
> **Parallel law:** `docs/BOARD-CLEAR-PARALLEL-SESSIONS.md`  
> Authority: (1) this file → (2) fetch + `gh pr list` → (3) SCOREBOARD + AGENT-BACKLOG → (4) freezes.

**Campaign status:** `RUNNING`  
**AFK:** `docs/BOARD-CLEAR-AFK-CONTRACT.md`  
**Tip when last acted:** `20cbd29` feat(agents): useful path (#375) — re-check every turn

---

## EXACT NEXT SHIP (do this now — single primary)

| Field               | Value                                                                                                             |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Ship ID**         | **A-P5-AGENTS** (if #375 not yet merged) **else A-UI-PRO**                                                        |
| **Program**         | P-P5-LIGHT → then P-UI                                                                                            |
| **Objective**       | Merge green #375 agents useful path; then pro desk density/craft vs STREAM-A-DESIGN-BAR (no fake numbers)         |
| **PATHS_ONLY**      | Agents: `services/svc-agents/**`. UI-PRO: vendor shell / design-bar gaps — **not** dual-edit open frontend PRs    |
| **Collision check** | #370 order-route (trade scripts/workflows) · #374 B3 withdraw · #346 pay babysit-only · path-intersect every turn |
| **Branch prefix**   | `feat/agents-` / `feat/ui-pro-`                                                                                   |
| **After merge**     | Scoreboard honesty · A-P5-OPS if free · babysit #346 · AGENT-COMPLETE only when residual empty                    |

**Secondary (if primary blocked):** A-UI-PRO · A-P5-OPS · babysit green agent PRs · wave audit after 4 product merges

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

| PR   | Owner       | Note                                                          |
| ---- | ----------- | ------------------------------------------------------------- |
| #375 | Board Clear | A-P5-AGENTS useful path — merge when CI green                 |
| #370 | parallel    | order-route CX-8 — **do not dual-edit trade scripts/package** |
| #374 | parallel    | app B3 withdraw — avoid dual-edit same vendor withdraw paths  |
| #346 | shehzad002  | M1 pay — babysit only                                         |
| #350 | Denon       | copy-spec docs — no dual-edit                                 |

---

## Shipped this GO wave

#356 MM-3 · #357 WS mock-E2E · #358 sub-accounts · #360 ops · #367 a11y · #359/#365 order-route residual · #368/#371 frontend · #373 A-TRADE-SPOT-OPS · **this PR A-TRADE-VENUE-OPS**

## Freezes

M1–M7 no implement · invent ban · apps/web ban · no dual-build same paths · no wait-for-shehzad

## Last updated

2026-08-02 A-TRADE-VENUE-OPS ship; NEXT → merge #375 then A-UI-PRO.
