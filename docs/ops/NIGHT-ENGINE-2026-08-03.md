# Night engine — why the first wave stopped + what continues

**Tip re-derive:** `git fetch && git log -1 --oneline origin/main`

## Why it looked like “only 30 minutes”

1. Your **written peace bar** was: free product empty **or** blocked-only + DASHBOARD.
2. After shell Class N (#462–#472) + claim locks (#471), freeze reported **freeProduct=0**, blocked **P-WS only**.
3. Law then forbids the “insane N” fantasy paths: Shehzad M1–M7 implement, Denon open-file dual-edit, invent depth while WS broken, features.mjs mid-wave.
4. Coordinator treated peace = session end. **That was wrong for “full night AFK.”** Peace is a **scoreboard checkpoint**, not a kill switch.

## Night engine rules (execution, not replan)

While AFK overnight, loop until human returns:

| Lane           | Action                                  | Stop condition                |
| -------------- | --------------------------------------- | ----------------------------- |
| Product freeze | re-freeze; SPAWN_NOW only               | none free or blocked-only     |
| Shell residual | invent scan / wire residual             | claim + PR                    |
| Class N Nitro  | merge when CI green                     | none open green               |
| Partner PRs    | babysit comment only                    | never implement               |
| P-WS           | **report only** integrity               | no depth UI                   |
| TRK-\*         | research/spec packs under docs/ops/trk/ | not full implement swarms     |
| #425           | rebase/conflict resolve Class N         | merged or blocked with reason |

Cadence: every ~15–30m re-freeze · PR matrix · merge green · spawn free · write R07.

## Honest limit (not thrift theater)

There is **not** infinite free product UI once residual is drained. Night value then is: partner CI hygiene, conflict unstick, integrity reports, tracker research, gate hardening — not 20 agents inventing depth.

## Cycle log (Coord-OPS)

### Cycle 2026-08-03 ~13:12–13:17Z

| Item            | Result                                                             |
| --------------- | ------------------------------------------------------------------ |
| Tip start       | `a0f73c86` #472 Index announce                                     |
| freeProduct     | **0** every freeze · SPAWN_NOW none                                |
| Merged          | #470 (pre-session) · #473 Denon format · **#474** night-engine law |
| Tip after       | `f96ac6b4` docs(ops): night engine keep-alive law (#474)           |
| Nitro open      | #425 rebased + force-push · #475 P-WS report prettier re-push      |
| Denon babysit   | comments on #448 #445 #422 #441 #428 #433 — no file edits          |
| Shehzad         | #346 still CONFLICTING — babysit only                              |
| Blocked product | P-WS-REPORT only                                                   |

Do **not** stop the loop solely because freeProduct=0 — continue Class N merges, partner babysit, #425, integrity docs, TRK research packs.
