# TRK-indexer.readmodels

**Title:** Chain → Postgres read models  
**Tracker:** `indexer.readmodels` · module `indexer` · phase 3P · status `ready` · owner none  
**Depends on:** `protocol.smart-accounts`  
**Tip freeze:** `origin/main` @ `04f9b1f2` (re-derive before implement)  
**Pack type:** thorough research upgrade (`docs/trk-research-pack-drain`) — no implement swarm; no money invention; no dual-edit Denon open money PRs; no `features.mjs` edit.

---

## 1 · What “done” means (plain language)

1. Chain → Postgres read models (books, fills, positions) with reorg safety.
2. Permissionless read API via edge `/api/indexer`.
3. Read path only — no custody.

## 2 · Current code state (tip `04f9b1f2`)

| Area        | Reality                                                         |
| ----------- | --------------------------------------------------------------- |
| Service     | `services/svc-indexer` mounted                                  |
| EVM adapter | Real JSON-RPC, reorg-aware                                      |
| Tracker     | Large mounted story; row may still `ready` for residual honesty |
| Sockets     | Other sockets (e.g. clob-contracts) may remain                  |

## 3 · Doctrine constraints

| Law            | Implication                   |
| -------------- | ----------------------------- |
| Read-only      | No ledger writes              |
| Reorg          | Unwind block-versioned rows   |
| Typed refusals | unreachable / mismatch / etc. |

## 4 · DoD sketch (checkable — staged)

### DoD checks

- [ ] Re-derive residual vs tracker note on tip
- [ ] Close remaining sockets with proof
- [ ] Mountain event to `done` only when title fully true

### Tracker `done` bar

Flip only when the title’s product promise is true in a real env — not when a stub route or empty skeleton merges.

## 5 · Open questions

1. Process lag vs real residual.
2. CLOB event signatures vs audited venue emissions.

## 6 · Estimated size

| Slice             | Size  |
| ----------------- | ----- |
| Honesty / docs    | **S** |
| Residual adapters | **M** |

## 7 · Related docs / code

- `services/svc-indexer/README.md`
- tracker note
- `dex.quote-router`

## 8 · Explicit non-goals for this pack

- No inventing chain data when RPC down.
