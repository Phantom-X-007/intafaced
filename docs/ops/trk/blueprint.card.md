# TRK-blueprint.card

**Title:** Share card render (1080×1350, 1200×630)  
**Tracker:** `blueprint.card` · module `blueprint` · phase 4 · status `ready` · owner none  
**Depends on:** `blueprint.onboarding`  
**Tip freeze:** `origin/main` @ `04f9b1f2` (re-derive before implement)  
**Pack type:** thorough research upgrade (`docs/trk-research-pack-drain`) — no implement swarm; no money invention; no dual-edit Denon open money PRs; no `features.mjs` edit.

---

## 1 · What “done” means (plain language)

1. Share cards at both §7.2 canvases with deterministic SVG compose.
2. Optional PNG rail via `BLUEPRINT_CARD_RENDERER_URL` when configured; honest residual when not.
3. Self-only (`blueprint:read`).

## 2 · Current code state (tip `04f9b1f2`)

| Area     | Reality                                                |
| -------- | ------------------------------------------------------ |
| Compose  | `card/compose.ts` pure SVG — **done** per tracker note |
| Renderer | http/card renderer for external PNG rail               |
| Tests    | determinism, palette, viewBox                          |
| Residual | PNG rail ops/config                                    |

## 3 · Doctrine constraints

| Law           | Implication                            |
| ------------- | -------------------------------------- |
| Brand palette | Fail off-palette hex                   |
| PII           | Card content respects export/§19 rules |
| Self-only     | No other-user card                     |

## 4 · DoD sketch (checkable — staged)

### DoD checks

- [ ] Product: SVG enough vs PNG required
- [ ] If PNG: renderer deploy + staging env
- [ ] Mountain event when accepted

### Tracker `done` bar

Flip only when the title’s product promise is true in a real env — not when a stub route or empty skeleton merges.

## 5 · Open questions

1. PNG host (no brand leak).
2. OG/social integration owner.

## 6 · Estimated size

| Slice        | Size         |
| ------------ | ------------ |
| SVG path     | largely done |
| PNG rail ops | **S–M**      |

## 7 · Related docs / code

- `services/svc-blueprint/src/card/*`
- tracker note

## 8 · Explicit non-goals for this pack

- No taste-only compose rewrites without product ask.
