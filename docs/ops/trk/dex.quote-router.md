# TRK-dex.quote-router

**Title:** Live cross-venue quote — real prices or a typed refusal  
**Tracker:** `dex.quote-router` · module `dex` · phase 5 · status `ready` · owner none  
**Depends on:** `indexer.readmodels`  
**Tip freeze:** `origin/main` @ `04f9b1f2` (re-derive before implement)  
**Pack type:** thorough research upgrade (`docs/trk-research-pack-drain`) — no implement swarm; no money invention; no dual-edit Denon open money PRs; no `features.mjs` edit.

---

## 1 · What “done” means (plain language)

1. `quote` returns a **live** best-execution quote from real sources **or** a **typed refusal** — never stale cache as live.
2. Age bound (`QUOTE_MAX_AGE_MS`) vs **this process’s read completion**.
3. `routePreview` never rendered as a price.
4. Non-custodial: custody-scan clean; no ledger writes.

## 2 · Current code state (tip `04f9b1f2`)

| Area     | Reality                                                                  |
| -------- | ------------------------------------------------------------------------ |
| Service  | `services/svc-dex` + `src/quote/*`                                       |
| README   | Live quote vs routePreview split documented                              |
| Tracker  | Code finished **and** cannot serve quote without live venues — both true |
| Residual | Mostly **ops/connectivity/config**, not greenfield router                |

## 3 · Doctrine constraints

| Law                  | Implication               |
| -------------------- | ------------------------- |
| No fabricated prices | Refuse > invent           |
| Non-custodial        | No `ledger.post`          |
| §17.5                | DEX = protocol front door |

## 4 · DoD sketch (checkable — staged)

### DoD checks

- [ ] Staging probe succeeds or refuses with stable codes
- [ ] Tests lock max-age / no-cache
- [ ] UI never treats routePreview as quote

### Tracker `done` bar

Flip only when the title’s product promise is true in a real env — not when a stub route or empty skeleton merges.

## 5 · Open questions

1. Required venues for production “done.”
2. Interaction with venue.aggregation trading half.

## 6 · Estimated size

| Slice                      | Size    |
| -------------------------- | ------- |
| Env + venue wiring + probe | **S–M** |
| New venue source           | **M**   |

## 7 · Related docs / code

- `services/svc-dex/README.md`
- `services/svc-dex/src/quote/quote-service.ts`
- `packages/venue-adapter`
- Tracker long note

## 8 · Explicit non-goals for this pack

- No fake prices for demos.
- No custodial shortcuts.
