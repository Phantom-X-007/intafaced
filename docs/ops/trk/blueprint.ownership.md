# TRK-blueprint.ownership

**Title:** Export + hard delete, cascading  
**Tracker:** `blueprint.ownership` · module `blueprint` · phase 4 · status `ready` · owner none  
**Depends on:** `blueprint.onboarding`  
**Tip freeze:** `origin/main` @ `04f9b1f2` (re-derive before implement)  
**Pack type:** thorough research upgrade (`docs/trk-research-pack-drain`) — no implement swarm; no money invention; no dual-edit Denon open money PRs; no `features.mjs` edit.

---

## 1 · What “done” means (plain language)

1. User can **export** and **hard delete** blueprint data.
2. Delete **cascades**: blueprint rows gone **and** identity `profiles.blueprint_id` cleared.
3. Title = cascade — blueprint half alone is not `done`.

## 2 · Current code state (tip `04f9b1f2`)

| Area                | Reality                                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------- |
| Erase in blueprint  | Implemented + tests; publishes `blueprintDeleted`                                        |
| Identity subscriber | Re-derive on tip — pack notes disagree historically; verify `blueprintDeleted` consumers |
| §2                  | Blueprint must not write identity tables                                                 |

## 3 · Doctrine constraints

| Law         | Implication                                     |
| ----------- | ----------------------------------------------- |
| Events      | identity consumes `blueprintDeleted`            |
| Hard delete | Mentor shortlists etc. tested on blueprint side |
| PII         | Export contents per privacy law                 |

## 4 · DoD sketch (checkable — staged)

### DoD checks

- [ ] Confirm or add `svc-identity` consumer clearing `blueprint_id`
- [ ] Cross-service integration test
- [ ] Post-erase state is onboarding-fresh

### Tracker `done` bar

Flip only when the title’s product promise is true in a real env — not when a stub route or empty skeleton merges.

## 5 · Open questions

1. Other FKs holding blueprint ids?
2. Legal hold exceptions.

## 6 · Estimated size

| Slice                     | Size    |
| ------------------------- | ------- |
| Identity consumer + tests | **S–M** |

## 7 · Related docs / code

- `services/svc-blueprint` erase tests
- `packages/events`
- tracker note

## 8 · Explicit non-goals for this pack

- No cross-service SQL from blueprint into identity.
