# TRK-academy.certs

**Title:** Certifications → XP → real perks  
**Tracker:** `academy.certs` · phase 5 · plane F · status `ready` · owner none  
**Depends on:** `academy.curriculum`, `identity.rank`  
**Tip freeze:** `origin/main` @ `b3d08931` (re-derive before implement)

## DoD (plain language)

A learner completes a curriculum item (or cert path), the platform records
**progress**, awards **XP** into the rank graph, and rank **perks** that depend
on that XP actually change (e.g. host rights, fee tiers — whatever the perk
table already defines). Certs are not theater: no “certificate PNG” without XP
idempotency and a real rank write. User-facing copy stays brand-clean.

## Path on tip

| Area            | Location                                                                              |
| --------------- | ------------------------------------------------------------------------------------- |
| Academy         | `services/svc-academy/` — catalog **read-only**; no progress table                    |
| Explicit gap    | README: progress / certs / XP “need `academy.certs` + identity rank”                  |
| Rank write      | `services/svc-identity` — `rank-service.awardXp` + `xp_events` (serviceProcedure)     |
| Event           | `packages/events` `xpEarned` — **published into the void** (no identity consumer yet) |
| Planned publish | svc-academy comments: emit `intafaced.identity.xp.earned` on certification            |
| Perks           | `services/svc-identity/src/rank/thresholds.ts` — `lobbyHostRights` etc.               |

**Tip residual:** full pipeline is open. Curriculum spine is thin/read-only;
identity can award XP only via internal calls; bus consumer for external XP is
a known honesty gap in the events catalog.

## Blocked by

| Blocker          | Notes                                                                                |
| ---------------- | ------------------------------------------------------------------------------------ |
| Curriculum depth | Full library is residual (`academy.curriculum`); day-one spine may be enough for v1  |
| XP bus           | Closing `xpEarned` subscriber in identity is likely a **prerequisite** PR (identity) |
| Product law      | Which actions grant how much XP / which cert ids → perks — Denon direction           |
| Money            | Certs themselves are not money; do **not** invent paid-cert ledger paths             |
| Soft             | Progress store design (academy table vs identity) — pick one owner, no dual write    |

## First PR size (if free)

**S (identity first if still open):** durable consumer for `xpEarned` →
`awardXp` with idempotency keys matching `xp_events` — closes the void publish.
**S–M (academy):** progress + `cert.complete` procedure (principal-bound),
publish XP once, tests that double-complete does not double XP. **No** paid
certificate product. Flip tracker only when complete → XP → perk is demonstrable
end-to-end on staging.
