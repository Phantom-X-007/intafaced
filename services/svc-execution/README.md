# svc-execution

Bounded execution-service foundations: sealed house-tenancy controls plus partial OMS/SOR/EMS, external arbitrage, and external market-making doors.

This is not the complete professional execution product. It does not provide durable whole-order lifecycle ownership, care/staged orders, desk handoff, allocations, independent drop copy, full best-execution reconstruction, TCA, or production-proven recovery and capacity. Internal house execution remains blocked by the accepted owner ruling.

## Current boundaries

- `execution.oms.plan` reuses `@intafaced/venue-adapter` routing over caller-supplied quotes and mandatory cost terms. Planning does not submit.
- `execution.oms.execute`, `cancel`, and `fetch` call explicitly wired venue adapters. Submit failure is reported rather than converted into a fill.
- `openOrders`, `balances`, `positions`, `rails`, `funding`, `borrow`, `latency`, `markets`, and `snapshot` expose venue observations without making them internal order, balance, position, or finality truth.
- `execution.oms.ems.list/get` reads an acknowledgement journal populated by successful submit responses. `EXECUTION_EMS_STORE_PATH` selects an append-only JSONL file; blank configuration uses process memory. This journal is not a complete OMS or independent drop copy.
- `execution.arb.scan/planLegs/executeLegs` supplies bounded external arbitrage helpers. Leg submission is sequential and may partially succeed; it is not atomic execution.
- `execution.mm.quote/hedge` supplies external-only quote and hedge planning. It does not authorize internal/affiliate market making, invent quotes, or hold inventory.
- `execution.tenant.describe/kill` retains the sealed tenant description and kill switch. The kill applies before authorized tenant execution.

All protected procedures use the edge HMAC principal under `/trpc` (edge mount `/api/execution`). The policy catalog is public; protected read doors require `admin:read`, and OMS/action doors currently require `admin:write`.

HTTP endpoints are `GET /health` and `GET /ready`. Readiness reports the `oms-ems` stage, EMS store mode and acknowledgement count, wired external trade/account/market-data venues, credential presence, operator/public-data supplements, and `internalVenue: blocked`. A ready process does not prove venue health, complete execution lifecycle, or production maturity.

## Events

This service does not publish bus events. Venue results and the local EMS acknowledgement journal do not replace canonical order/fill events, lookup, reconciliation, or customer drop copy.

## Money and ledger

This service holds no balances and posts no ledger recipes. Venue balance observations are external evidence only. All value movement remains in existing `packages/ledger-client` recipes and the canonical ledger; this service never assembles a second book.
