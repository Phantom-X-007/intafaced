# TRK-blueprint.card — research / spec pack

**Tracker id:** `blueprint.card`  
**Title:** Share card render (1080×1350, 1200×630)  
**Module / phase:** `blueprint` · phase 4  
**Status on tip:** `ready` · **owner:** none  
**Depends on:** `blueprint.onboarding`  
**Tip freeze:** `origin/main` @ `c6d9e89e` (re-derive before implement)  
**Pack type:** research only — no implement swarm; no money invention; no dual-edit of Denon open money PRs; no `features.mjs` edit.

---

## 1 · What “done” means (plain language)

1. Share cards at both §7.2 canvases with deterministic SVG compose.
2. Optional PNG rail via `BLUEPRINT_CARD_RENDERER_URL` when configured; honest residual when not.
3. Self-only (`blueprint:read`).

## 2 · Current code state (tip `c6d9e89e`)

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

## 4 · DoD sketch

- [ ] Product: SVG enough vs PNG required
- [ ] If PNG: renderer deploy + staging env
- [ ] Mountain event when accepted

## 5 · Open questions

1. PNG host (no brand leak).
2. OG/social integration owner.

## 6 · Estimated size

SVG path largely done; PNG rail **S–M** ops.

## 7 · Related

- `services/svc-blueprint/src/card/*`, short stub, tracker note

## 8 · Non-goals

- No taste-only compose rewrites without product ask.
