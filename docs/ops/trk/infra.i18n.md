# TRK-infra.i18n

**Title:** 100+ languages — keyed from day one (§9)  
**Tracker:** `infra.i18n` · phase 0 · plane F · status `ready` · owner none  
**Depends on:** `infra.ui-tokens` (done)

## DoD (plain language)

Every user-facing string on shipped surfaces goes through `@intafaced/i18n`
keys. Missing translations fall back to English with measured gaps — never blank
keys, never machine-translated money copy. “100+ languages” is catalogs over
time, not a refactor of components. Operators can see coverage (declared vs
catalogued) and never claim 100% from one English file.

## Path on tip

| Area | Location |
| --- | --- |
| Package | `packages/i18n/` (`locales.ts`, catalogs, formatters) |
| Consumer today | `services/svc-notify` (out-of-app copy) |
| Hardcoded English | `apps/web/src/**` many `const copy = { … }` modules |
| Gate | §9 / §14.4; brand-scan separate |

**Tip residual:** ~28 locales declared; **1 catalog (en)**; surfaces **not**
keyed. Package README is the honest scoreboard (`localeCoverage()`). Adding a
language is an **owner content cost**, not “run a model over strings.”

## Blocked by

| Blocker | Notes |
| --- | --- |
| Content ownership | Non-English catalogs need human/process owner (Class X-ish content quality) |
| Product shell | `apps/web` keying is craft residual — free for agents if claimed |
| Money copy risk | Mistranslated withdraw/confirm is a loss event — no auto-MT |

Not blocked by money spine or Shehzad. Not blocked by Denon product law for
keying existing English.

## First PR size (if free)

**S–M:** key **one** high-traffic surface (e.g. `app-shell` + landing primary
strings) through `@intafaced/i18n`, delete local `copy` objects for those
strings only, add a test that those files import the package. Do **not** claim
“100+ languages done.” Separate PRs per surface; never bulk-MT catalogs.
