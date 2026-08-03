# TRK-blueprint.ownership — research / spec pack

**Tracker id:** `blueprint.ownership`  
**Title:** Export + hard delete, cascading  
**Module / phase:** `blueprint` · phase 4  
**Status on tip:** `ready` · **owner:** none  
**Depends on:** `blueprint.onboarding`  
**Tip freeze:** `origin/main` @ `c6d9e89e` (re-derive before implement)  
**Pack type:** research only — no implement swarm; no money invention; no dual-edit of Denon open money PRs; no `features.mjs` edit.

---

## 1 · What “done” means (plain language)

1. User can **export** and **hard delete** blueprint data.
2. Delete **cascades**: blueprint rows gone **and** identity `profiles.blueprint_id` cleared.
3. Title = cascade — blueprint half alone is not `done`.

## 2 · Current code state (tip `c6d9e89e`)

| Area                | Reality                                           |
| ------------------- | ------------------------------------------------- |
| Erase in blueprint  | Implemented + tests; publishes `blueprintDeleted` |
| Identity subscriber | Tracker: **no consumer** clears `blueprint_id`    |
| §2                  | Blueprint must not write identity tables          |

## 3 · Doctrine constraints

| Law         | Implication                                             |
| ----------- | ------------------------------------------------------- |
| Events      | identity consumes `blueprintDeleted`                    |
| Hard delete | Mentor shortlists etc. already tested on blueprint side |
| PII         | Export contents per privacy law                         |

## 4 · DoD sketch

- [ ] `svc-identity` consumer clears `blueprint_id`
- [ ] Cross-service integration test
- [ ] Post-erase state is onboarding-fresh

## 5 · Open questions

1. Other FKs holding blueprint ids?
2. Legal hold exceptions.

## 6 · Estimated size

**S–M** identity consumer + tests.

## 7 · Related

- `services/svc-blueprint` erase tests, `packages/events`, tracker note

## 8 · Non-goals

- No cross-service SQL from blueprint into identity.
