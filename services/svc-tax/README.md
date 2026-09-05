# svc-tax

Per-jurisdiction lot export over ledger reads. **Not** a second money book, **not** a CSV re-import, **not** counsel.

Blank owner `TAX_JURISDICTION_MAP_JSON` refuses `tax.jurisdiction_unmapped`. Caller selects `FIFO|LIFO|HIFO` — no silent country default. Empty books return an empty pack, never a fabricated `$0` PnL. Missing lot/cost-basis is named unknown (`tax.cost_basis_unavailable` / `tax.lot_underflow`) — never an invented pairing or a `0` basis. Amounts are decimal strings. Completeness is OWNER map: packs stamp `complete: false` and residual `tax.export_incomplete`; `complete: true` is refused. Never invent jurisdictions.

## API

| Procedure       | Scope      | Input           | Output                       |
| --------------- | ---------- | --------------- | ---------------------------- |
| `health`        | public     | —               | `{ ok, service, custodial }` |
| `exportPreview` | `tax:read` | `{ lotMethod }` | preview; amounts as strings  |
| `exportPack`    | `tax:read` | `{ lotMethod }` | JSON pack (`bodyBase64`)     |

## Events

None. This service publishes no subjects.

## Ledger

Read-only. `balances` + `history` over `@intafaced/ledger-client` HTTP to svc-ledger. No recipes. No `post`.

| Read       | Why                                   |
| ---------- | ------------------------------------- |
| `balances` | current available books               |
| `history`  | lot reconstruction for those accounts |

Data lake / indexer missing → named `absent` on the pack (`tax.data_lake_unavailable`, `tax.indexer_unavailable`). A set URL is `configured` + `tax.data_lake_unprobed` / `tax.indexer_unprobed` — never `ok`. Never filled in as `$0`.
