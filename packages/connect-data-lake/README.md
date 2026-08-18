# @intafaced/connect-data-lake

Stage-1 in-process capture log for §27:762 / D-S-18. Capture only.

A venue that is not connected is **absent in the record**, never an empty book.
This package does not choose, provision, or compose a time-series store. Retention
is unwritten.

## Shape

- `{ status: 'absent', reason: 'venue_not_connected' }` — unwired / unconnected.
- `{ status: 'measured', occupancy: 'empty' }` — adapter returned a real empty book.
- `{ status: 'measured', occupancy: 'populated' }` — adapter returned levels.

`bookLevelsFromCapture` returns `null` for absent. It never synthesises `bids: []`.

## Leverage

`@intafaced/market-data` ingest + ADR `docs/adr/2026-08-04-predict-quant-connect-law.md`.
Not a second book, not Timescale/ClickHouse, not compose.
