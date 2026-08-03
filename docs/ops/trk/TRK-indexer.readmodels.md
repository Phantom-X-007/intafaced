# TRK-indexer.readmodels — research / spec pack

**Tracker id:** `indexer.readmodels`  
**Title:** Chain → Postgres read models  
**Module / phase:** `indexer` · phase 3P  
**Status on tip:** `ready` · **owner:** none  
**Depends on:** `protocol.smart-accounts`  
**Tip freeze:** `origin/main` @ `c6d9e89e` (re-derive before implement)  
**Pack type:** research only — no implement swarm; no money invention; no dual-edit of Denon open money PRs; no `features.mjs` edit.

---

## 1 · What “done” means (plain language)

1. Chain → Postgres read models (books, fills, positions) with reorg safety.
2. Permissionless read API via edge `/api/indexer`.
3. Read path only — no custody.

## 2 · Current code state (tip `c6d9e89e`)

| Area        | Reality                                                         |
| ----------- | --------------------------------------------------------------- |
| Service     | `services/svc-indexer` mounted                                  |
| EVM adapter | Real JSON-RPC, reorg-aware                                      |
| Tracker     | Large mounted story; row may still `ready` for residual honesty |
| Sockets     | evm-rpc closed per notes; other sockets may remain              |

## 3 · Doctrine constraints

| Law            | Implication                   |
| -------------- | ----------------------------- |
| Read-only      | No ledger writes              |
| Reorg          | Unwind block-versioned rows   |
| Typed refusals | unreachable / mismatch / etc. |

## 4 · DoD sketch

- [ ] Re-derive residual vs tracker note on tip
- [ ] Close remaining sockets with proof
- [ ] Mountain event to `done` only when title fully true

## 5 · Open questions

1. Process lag vs real residual.
2. CLOB event signatures vs audited venue emissions.

## 6 · Estimated size

Often **S** honesty or **M** residual adapters.

## 7 · Related

- `services/svc-indexer/README.md`, tracker note, `dex.quote-router`

## 8 · Non-goals

- No inventing chain data when RPC down.
