# TRK-academy.spatial

**Title:** 2D navigable room canvas, VR-ready scene state  
**Tracker:** `academy.spatial` · module `academy` · phase 5 · status `ready` · owner none  
**Depends on:** `academy.lobbies`  
**Tip freeze:** `origin/main` @ `04f9b1f2` (re-derive before implement)  
**Pack type:** thorough research upgrade (`docs/trk-research-pack-drain`) — no implement swarm; no money invention; no dual-edit Denon open money PRs; no `features.mjs` edit.

---

## 1 · What “done” means (plain language)

Title promise for `academy.spatial` is product-complete, not “a stub route exists.”  
**Reality check:** Schema `scene` for 2D spatial layer exists; full canvas product residual.

## 2 · Current code state (tip `04f9b1f2`)

| Area       | Reality                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------- |
| Service    | `services/svc-academy` — lobbies, host-rights, curriculum catalog, spatial `scene`                            |
| Curriculum | `curriculum/catalog.ts` thin real catalog; full DERIV//DESK 20+3 residual (see `academy-service.ts` comments) |
| Edge       | `/api/academy` in `svc-edge`                                                                                  |
| Flags      | `academy.inviteLobbies`, `academy.tournament`                                                                 |
| Scopes     | `academy:read` / `academy:write`                                                                              |
| XP         | `intafaced.identity.xp.earned` named for cert path — consumer wiring residual                                 |

## 3 · Doctrine constraints

| Law           | Implication                                                  |
| ------------- | ------------------------------------------------------------ |
| Brand         | Education content copy vendor-clean                          |
| Money         | Tournament prizes / ambassador IFC pay → ledger recipes only |
| Paper trading | Must not spend real ledger balances                          |
| Events        | XP must not double-award                                     |

## 4 · DoD sketch (checkable — staged)

### Stage 1

- [ ] Spec matches code: live vs residual for **this** id
- [ ] Smallest vertical slice for this title only

### Stage 2

- [ ] Title-level acceptance tests
- [ ] i18n for new strings
- [ ] Money paths (if any) Class M audited

### Tracker `done` bar

Flip only when the title’s product promise is true in a real env — not when a stub route or empty skeleton merges.

## 5 · Open questions

1. Content licensing for full curriculum import.
2. Prize pool funding + custody.
3. Paper market operator controls.

## 6 · Estimated size

| Slice                  | Size          |
| ---------------------- | ------------- |
| Catalog/certs progress | **M–L**       |
| Spatial canvas UI      | **L**         |
| Tournaments + prizes   | **L** Class M |
| Ambassadors pay        | **L** Class M |

## 7 · Related docs / code

- `services/svc-academy/src/curriculum/catalog.ts`
- `services/svc-academy/src/academy-service.ts`
- `packages/contracts` blueprint curriculumPath
- `packages/ledger-client` tournament prize notes

## 8 · Explicit non-goals for this pack

- No inventing full 20+3 content without product assets.
- No real-money paper trading confusion.
- No `features.mjs` edit.
