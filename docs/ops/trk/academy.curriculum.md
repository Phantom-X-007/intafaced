# TRK-academy.curriculum

**Title:** DERIV//DESK library import — 20 playbooks + 3 workbooks  
**Tracker:** `academy.curriculum` · phase 5 · plane F · status `ready` · owner none  
**Depends on:** `academy.lobbies` (done)  
**Tip freeze:** `origin/main` @ `c773dafa` (re-derive before implement)  
**Pack type:** research only — no implement; no invent educational IP; no `features.mjs` edit.

## DoD (plain language)

Learners can list and open the **full** curriculum set (tracker names **20
playbooks + 3 workbooks**) through the existing academy API, filtered by
Blueprint path/kind, with real markdown bodies — not placeholders. Content is
**licensed/owned** material imported under brand rules (no forbidden vendor
names in user-facing copy). Progress/certs remain out of scope (`academy.certs`).

## Path on tip

| Area    | Location                                                        |
| ------- | --------------------------------------------------------------- |
| Service | `services/svc-academy/`                                         |
| Catalog | `src/curriculum/catalog.ts` — pure in-process **day-one spine** |
| API     | `curriculum`, `curriculumItem` (`academy:read`)                 |
| Mount   | edge `/api/academy`                                             |

**Tip residual:** thin catalog **ships** (few playbooks/lessons + one workbook
shell across foundations/markets/builder/sovereign paths). Full DERIV//DESK
library is **proprietary and not in the monorepo** — README + catalog header
state full import is residual. No DB table for curriculum; no progress write;
no NATS.

## Blocked by

| Blocker          | Notes                                                           |
| ---------------- | --------------------------------------------------------------- |
| Content / rights | Owner must supply importable library (Class X content / legal)  |
| Brand (§0.7)     | Import pipeline must strip/rename forbidden third-party strings |
| Not blocked      | Lobbies API, read path, Blueprint path enum already real        |

Agents must **not** fabricate 20 playbooks of educational IP.

## First PR size (if free)

**S after content lands:** import script or seed module that loads
owner-supplied markdown into the catalog shape (or a DB table if volume
requires), golden tests for count/paths, brand-scan clean. **Without content:**
only scaffold + empty import format doc (Class N) — do not mark mountain done.
Optional tiny PR: persist catalog to Postgres for ops edit without redeploy
(still needs content).
