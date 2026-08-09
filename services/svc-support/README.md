# svc-support

Support desk for `ops.support` — tickets + knowledge base + operator queue.

**Durable store:** Postgres schema `support` (role `svc_support`). Memory store
remains for unit tests only. Multi-replica claims use an atomic `UPDATE … WHERE
assignee_id IS NULL`.

No ledger posts. No refund money path. Refunds are requests only; money stays in
pay/ledger recipes elsewhere.

Doctrine: §0.6 no balances here; brand scan on KB copy; agent optional later.

## API

tRPC under `/trpc` (edge mounts `/api/support`). Principal via edge HMAC
(`EDGE_PRINCIPAL_SECRET`).

| Procedure              | Scope                 | Behaviour                   |
| ---------------------- | --------------------- | --------------------------- |
| `support.create`       | `support:write`       | Create ticket for principal |
| `support.listMine`     | `support:read`        | List caller tickets         |
| `support.listAll`      | `support:ops`         | Operator list               |
| `support.get`          | `support:read` / ops  | Self or operator            |
| `support.comment`      | `support:write` / ops | Add comment                 |
| `support.listComments` | `support:read` / ops  | Thread for ticket           |
| `support.setStatus`    | `support:ops`         | Operator status change      |
| `support.listKb`       | public                | Platform i18n-keyed spine   |
| `support.searchKb`     | public                | Search spine by fragment    |
| `support.getKb`        | public                | One article or null         |
| `support.listQueue`    | `support:ops`         | Prioritised queue           |
| `support.next`         | `support:ops`         | Peek next                   |
| `support.claim`        | `support:ops`         | Exclusive claim (atomic)    |

HTTP: `GET /health`, `GET /ready` (`stage: 3-durable-queue`, `store: postgres`).

## Migrations

```bash
DATABASE_URL=postgres://svc_support:svc_support@localhost:5433/intafaced pnpm --filter @intafaced/svc-support db:migrate
```

Dev bootstrap creates role/schema via `tooling/infra/postgres-init/01-service-schemas.sql`.
`tooling/infra/migrate-all.mjs` includes `svc-support`.

## Events

**None published.** Ticket create/status stay in-process until a bus catalog
subject is accepted (events PR first). No orphan subjects.

## Ledger

**No ledger recipes.** This service holds no balances and never calls
`packages/ledger-client`.
