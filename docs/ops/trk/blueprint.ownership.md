# TRK-blueprint.ownership

**Title:** Export + hard delete, cascading  
**Tracker:** `blueprint.ownership` · phase 4 · plane F · status `ready` · owner none  
**Depends on:** `blueprint.onboarding` (done) · **requires:** `services/svc-blueprint`

## DoD (plain language)

A user can **export** everything this platform holds about their Blueprint
(JSON + card per §7.2) and **hard-erase** it so no Blueprint row remains and
`profiles.blueprint_id` does not dangle. Cascade is real end-to-end across
services — not only inside svc-blueprint’s schema.

## Path on tip

| Area                         | Location                                                                  |
| ---------------------------- | ------------------------------------------------------------------------- |
| Export / erase (done)        | `services/svc-blueprint` — `export`, `erase` tRPC; hard delete in one txn |
| Events (done)                | `blueprintCreated` / `blueprintDeleted` in `packages/events`              |
| Identity consumer (**done**) | `svc-identity` `subscribeBlueprintProfileEvents` at boot — **wired**      |
| Tests                        | Identity unit + bus tests; blueprint still has stand-in consumer in suite |
| Stale tracker note           | features.mjs still claims “no service subscribes” — **false on tip**      |

Re-derive: tip `b3d08931` identity index subscribes durable
`identity-blueprint-created` / `identity-blueprint-deleted`. Match-guarded clear
on delete. Export schemaVersion 2 includes card; mentoringOthers privacy rules
documented in service README.

## Blocked by

| Blocker             | Notes                                                                    |
| ------------------- | ------------------------------------------------------------------------ |
| Honesty / proof gap | Prefer one cross-service e2e (erase → identity pointer null) in CI fleet |
| Tracker note stale  | Mountain event to `done` only after proof + note rewrite (not this pack) |
| Downstream caches   | Other consumers of profile pointer must drop on delete (catalog law)     |

Not Shehzad. Not Class X content. **Almost residual-thin.**

## First PR size (if free)

**S — proof, not product:** fleet or compose test: create blueprint → identity
sets pointer → erase → identity clears when ids match; redelivered delete does
not wipe newer blueprint. Then mountain event to `done` if DoD holds. Avoid
rebuilding erase. Do not edit features.mjs from research-only packs.

**Solid spec:** [TRK-blueprint.ownership.md](./TRK-blueprint.ownership.md)
