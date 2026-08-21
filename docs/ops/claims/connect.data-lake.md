# Claim connect.data-lake

**id:** connect.data-lake  
**tracker:** `connect.data-lake` (stays **wip** — no TSDB / retention; Denon fabric `CaptureLake` remains)  
**branch:** `feat/connect-data-lake-capture`  
**owner:** Nitro agent  
**status:** claimed  
**class:** N  
**scope:** `packages/connect-data-lake/**` · `packages/market-data/src/{depth,trade,index}.ts` (+ tests)

## Done bar

Law §27:762 / D-S-18 capture only. Unconnected venue → `{ status: 'absent', reason: 'venue_not_connected' }`. Never `bids: []` as a fake quiet market. Stage-1 in-process log. Consumer imports via `@intafaced/market-data`.

## Out of scope

- Compose / Timescale / ClickHouse
- Retention policy
- Dual-edit `packages/venue-adapter`, `services/svc-trade`, svc-ws `private/**`
- LIVE-LANES.md
- Invent prices / Shehzad chain / FE
