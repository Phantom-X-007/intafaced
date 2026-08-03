# TRK-infra.i18n

**Title:** 100+ languages — keyed from day one (§9)  
**Tracker:** `infra.i18n` · phase 0 · plane F · status `ready` · owner none  
**Depends on:** `infra.ui-tokens` (done) · **requires:** `packages/i18n`  
**Tip freeze:** `origin/main` @ `c773dafa` (re-derive before implement)  
**Pack type:** research only — no bulk MT; no tracker flip.

## DoD (plain language)

Every user-facing string on shipped **customer** surfaces goes through
`@intafaced/i18n` keys. Missing translations fall back to English with measured
gaps — never blank keys, never machine-translated money copy. “100+ languages”
is catalogs over time, not a refactor of components. Operators can see coverage
(`localeCoverage()`) and never claim 100% from one English file.

## Path on tip

| Area             | Location                                                        |
| ---------------- | --------------------------------------------------------------- |
| Package          | `packages/i18n/` (`locales.ts`, `catalogs.ts`, formatters)      |
| Declared locales | **28** (tests assert the number — not “100+”)                   |
| Catalogs         | **1** — English only (`CATALOGS`)                               |
| Consumer today   | `services/svc-notify` (out-of-app render)                       |
| Customer UI      | `apps/web` local `const copy = { … }` — **not** through package |
| Gates            | `scan:i18n` advisory; `scan:i18n-bypass` ratchet on verify      |

**Tip residual:** package + honesty scoreboard ship; surfaces largely unkeyed;
no React provider / `useT()`; non-English catalogs are **owner content cost**.

## Blocked by

| Blocker           | Notes                                                                 |
| ----------------- | --------------------------------------------------------------------- |
| Content ownership | Non-English catalogs need human/process owner (quality, not agent MT) |
| Product shell     | `apps/web` keying is craft residual — free for agents if claimed      |
| Money copy risk   | Mistranslated withdraw/confirm is a loss event — no auto-MT           |

Not blocked by money spine or Shehzad. Not blocked by Denon product law for
keying existing English.

## First PR size (if free)

**S–M:** key **one** high-traffic surface (e.g. app-shell / landing primary
strings) through `@intafaced/i18n`, delete local `copy` objects for those
strings only, add a test that those files import the package. Do **not** claim
“100+ languages done.” Separate PRs per surface; never bulk-MT catalogs.
Adoption layer (provider + locale choice) may land first as a thin platform PR.
