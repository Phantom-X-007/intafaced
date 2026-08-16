# svc-execution

Stage-1 **house-desk tenancy mechanism** (Throne Law §28:777, ADR D26-P0-01).

This service is **not** an SOR, OMS, EMS, or arbitrage engine. It exposes health
plus operator tRPC to **describe** and **kill** a sealed house tenant. The
internal-venue half (pointing the tenant at our matching book) stays **blocked**.

In-memory sealed registry. No Postgres. No balances.

## API

tRPC under `/trpc` (edge mounts `/api/execution`). Principal via edge HMAC
(`EDGE_PRINCIPAL_SECRET`).

| Procedure                   | Scope         | Behaviour                                      |
| --------------------------- | ------------- | ---------------------------------------------- |
| `execution.tenant.describe` | `admin:read`  | Namespace, killed flag, audit count            |
| `execution.tenant.kill`     | `admin:write` | Admin kill-switch (ADR rule 5) — applies first |

HTTP: `GET /health`, `GET /ready` (`stage: house-tenant-mechanism`,
`internalVenue: blocked`).

Library: `@intafaced/execution-house-tenant` — `authorizeTenantVenue` refuses
`kind: 'internal'` and `matching-book` with `internal_venue` (same token as
`refuseInternalMm`). External venue ids are opaque strings.

## Events

None. This Stage-1 slice does not publish bus events.

## Ledger

None. This process holds no balances and posts no recipes. House fills, when
an owner ruling later permits them, move value only through existing
`packages/ledger-client` recipes — never a second book in this service.
