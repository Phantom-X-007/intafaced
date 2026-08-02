# Board Clear — NEXT

> **READ THIS FIRST AFTER COMPACT / continue.** Agent self-resumes.  
> Never chat summary · TRACKER.md · WAVE-AUDIT as live SoT.  
> **Parallel law:** `docs/BOARD-CLEAR-PARALLEL-SESSIONS.md`  
> Authority: (1) this file → (2) fetch + `gh pr list` → (3) SCOREBOARD + AGENT-BACKLOG → (4) freezes.

**Campaign status:** `AGENT-COMPLETE` (board still open on human M1–M7)  
**AFK:** `docs/BOARD-CLEAR-AFK-CONTRACT.md`  
**Tip when last acted:** re-check every turn (final craft pass after #380)

---

## EXACT NEXT SHIP (do this now — single primary)

| Field               | Value                                                                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ship ID**         | **BABYSIT-HUMAN** · optional **CRAFT-REGISTER**                                                                                                |
| **Program**         | P-TRACK + babysit                                                                                                                              |
| **Objective**       | Keep human PRs unblocked: #346 pay (dirty — shehzad only) · #350 Denon. Optional residual-register craft if free paths. Never implement M1–M7. |
| **PATHS_ONLY**      | Board docs · non-colliding frontend craft only                                                                                                 |
| **Collision check** | `gh pr list` every turn                                                                                                                        |
| **Branch prefix**   | `docs/board-clear-` / `feat/app-` (craft only if no dual-edit)                                                                                 |
| **After merge**     | Stay on babysit until BOARD-COMPLETE or session end                                                                                            |

**Secondary:** none required for AGENT-COMPLETE. Do not invent product on human rows.

---

## Pre-code ritual (every continue — mandatory)

```
git fetch origin main && git log origin/main -1 --oneline
gh pr list --state open
path-intersect before any code ship
if only human OPEN → babysit + HUMAN-BLOCKERS stay true
```

---

## Open PRs (snapshot — re-derive)

| PR   | Owner      | Note                                 |
| ---- | ---------- | ------------------------------------ |
| #346 | shehzad002 | M1 pay dirty/conflict — babysit only |
| #350 | Denon      | copy-spec docs — no dual-edit        |

---

## Shipped this GO wave (agent)

#356 MM-3 · #357 WS mock-E2E · #358 sub-accounts · #360 P5-OPS · #367 a11y · #370 CX-8 · #373 SPOT-OPS · #375 agents · #376 VENUE-OPS · #368/#371/#374/#377 frontend · #372 parallel law · this track-sync AGENT-COMPLETE

## Freezes

M1–M7 no implement · invent ban · apps/web ban · no dual-build same paths · no wait-for-shehzad

## Last updated

2026-08-02 AGENT-COMPLETE declared — agent rows Done/Cut; human M1–M7 remain for BOARD-COMPLETE.
