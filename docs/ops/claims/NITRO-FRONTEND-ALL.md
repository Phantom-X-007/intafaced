# Claim NITRO-FRONTEND-ALL

**status:** HUMAN (Nitro)
**proof:** `docs/LIVE-LANES.md` lane `nitro-frontend-all` · doctrine §5.3 · ADR `docs/adr/2026-08-03-retire-apps-web-port-to-vue-shell.md`
**tip:** 30f1be23
**updated:** 2026-08-04

Claim-lock is spawn authority. This one is a **human** lock, not a residual-own lock:
no agent spawns into these paths at any priority, including P5 hygiene.

## Scope — agents edit no file under these

| Path                                    | What it is                          |
| --------------------------------------- | ----------------------------------- |
| `vendor/upstream-exchange/05_Web_Front` | the sole product surface (`:8090`)  |
| `vendor/upstream-exchange/04_Web_Admin` | vendored staff console (not served) |
| `apps/web`                              | retired Next scaffold (see ADR)     |
| `apps/admin`                            | operator console (`:3100`)          |
| `packages/ui`                           | design tokens + console primitives  |
| `packages/i18n`                         | language keys                       |

Craft, polish, rebrand, a11y, honesty passes and **tests** are all in scope of the lock.
"Class N shell craft" in a PR body does not create an exemption.

## What the swarm does instead

Removing this lane removes the swarm's largest source of work, and a prohibition with no
replacement becomes idling. The replacement, in priority order:

1. Bank thin + identity money graph (`nitro-reclaim-bank-id`, reclaimed).
2. Trade-light residual.
3. Pay OS residual, after the #346 handoff comment.
4. Backend P1 stranded branches — path-clean `feat/*` and `fix/*` that touch **no** path above.
5. INTEGRITY reports and partner unblock comments as usual.

## If backend work appears to require a front-end edit

Stop and open an issue naming the file. Do not edit it, and do not work around it by
adding the change to a vendored copy.

## Release

Only Nitro releases this lane, in `docs/LIVE-LANES.md` and here, in the same PR.
