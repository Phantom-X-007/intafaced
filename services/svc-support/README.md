# svc-support

Support desk for `ops.support` — tickets + knowledge base.

**Stage-1:** in-memory ticket spine. No ledger posts. No refund money path.
Refunds are requests only; money stays in pay/ledger recipes elsewhere.

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

HTTP: `GET /health`, `GET /ready` (`stage: 1-memory`).

## Events

**None published Stage-1.** Ticket create/status stay in-process until a bus
catalog subject is accepted (events PR first). No orphan subjects.

## Ledger

**No ledger recipes.** This service holds no balances and never calls
`packages/ledger-client`. Ticket bodies may mention refunds as free text only;
value movement remains pay/bank/ledger elsewhere.

## Observability

OpenTelemetry spans via `withSupportSpan` (`intafaced.money_path=false`,
module `support`). SLO residual: one Grafana panel for ticket create rate —
ops backlog, not a ship gate for Stage-1 memory store.
