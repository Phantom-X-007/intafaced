# TRK-dex.quote-router — research / spec pack

**Tracker id:** `dex.quote-router`  
**Title:** Live cross-venue quote — real prices or a typed refusal  
**Module / phase:** `dex` · phase 5  
**Status on tip:** `ready` · **owner:** none  
**Depends on:** `indexer.readmodels`  
**Tip freeze:** `origin/main` @ `c6d9e89e` (re-derive before implement)  
**Pack type:** research only — no implement swarm; no money invention; no dual-edit of Denon open money PRs; no `features.mjs` edit.

---

## 1 · What “done” means (plain language)

1. `quote` returns a **live** best-execution quote from real sources **or** a **typed refusal** — never stale cache as live.
2. Age bound (`QUOTE_MAX_AGE_MS`) vs **this process’s read completion**.
3. `routePreview` never rendered as a price.
4. Non-custodial: custody-scan clean; no ledger writes.

## 2 · Current code state (tip `c6d9e89e`)

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

## 4 · DoD sketch

- [ ] Staging probe succeeds or refuses with stable codes
- [ ] Tests lock max-age / no-cache
- [ ] UI never treats routePreview as quote

## 5 · Open questions

1. Required venues for production “done.”
2. Interaction with venue.aggregation trading half.

## 6 · Estimated size

Env+probe **S–M**; new venue source **M**.

## 7 · Related

- `services/svc-dex/README.md`, `src/quote/quote-service.ts`
- `packages/venue-adapter`
- Tracker long note

## 8 · Non-goals

- No fake prices for demos.
- No custodial shortcuts.
