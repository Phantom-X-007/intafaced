# TRK-academy.certs — research / spec pack

**Tracker id:** `academy.certs`  
**Title:** Certifications → XP → real perks  
**Module / phase:** `academy` · phase 5  
**Status on tip:** `ready` · **owner:** none  
**Depends on:** `academy.curriculum` · `identity.rank`  
**Tip freeze:** `origin/main` @ `c6d9e89e` (re-derive before implement)  
**Pack type:** research only — no implement swarm; no money invention; no dual-edit of Denon open money PRs; no `features.mjs` edit.

---

## 1 · What “done” means (plain language)

Title promise for `academy.certs` is product-complete, not “a stub route exists.”  
**Reality check:** Needs progress + identity.rank XP event; certs not full product.

## 2 · Current code state (tip `c6d9e89e`)

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

## 4 · DoD sketch (staged)

### Stage 1

- [ ] Spec matches code: live vs residual for **this** id
- [ ] Smallest vertical slice for this title only

### Stage 2

- [ ] Title-level acceptance tests
- [ ] i18n for new strings
- [ ] Money paths (if any) Class M audited

## 5 · Open questions

1. Content licensing for full curriculum import.
2. Prize pool funding + custody.
3. Paper market operator controls.

## 6 · Estimated size

Catalog/certs **M–L**; spatial UI **L**; tournaments/ambassadors **L** Class M.

**First PR:** non-money content/catalog slice — **S–M**.

## 7 · Related

- `services/svc-academy/src/curriculum/catalog.ts`
- `services/svc-academy/src/academy-service.ts`
- `packages/contracts` blueprint `curriculumPath`
- `packages/ledger-client` tournament prize notes

## 8 · Non-goals

- No inventing full 20+3 content without product assets.
- No real-money paper trading confusion.
- No `features.mjs` edit.
