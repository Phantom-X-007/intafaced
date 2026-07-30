# svc-notify

In-app notification inbox for ops.notifications. Event-driven fan-out writes
rows the user can list and mark read. **Not** push, email, or SMS — those are
§13 sockets and deliberately absent.

This service holds no balances and posts no ledger transactions.

## API

| Procedure            | Scope          | Input                              | Output                           |
| -------------------- | -------------- | ---------------------------------- | -------------------------------- |
| `health`             | public         | —                                  | `{ ok, service, fanoutEnabled }` |
| `notify.list`        | `notify:read`  | `{ cursor?, limit?, unreadOnly? }` | `{ items, nextCursor }`          |
| `notify.unreadCount` | `notify:read`  | —                                  | `{ count }`                      |
| `notify.markRead`    | `notify:write` | `{ ids: uuid[] }`                  | `{ marked }`                     |
| `notify.markAllRead` | `notify:write` | —                                  | `{ marked }`                     |

Every procedure is self-only via `principal.userId`. Title/body are i18n keys
(`title_key` / `body_key`); clients render copy from `@intafaced/i18n`
(`notify.*` keys).

### Edge path

Reach this service through **svc-edge** (not direct to port 4015 in production):

| Client path                        | Upstream                                                                              |
| ---------------------------------- | ------------------------------------------------------------------------------------- |
| `GET /api/notify/trpc/<procedure>` | `GET /trpc/<procedure>` on svc-notify (`NOTIFY_URL`, default `http://localhost:4015`) |

Examples: `GET /api/notify/trpc/health`, `GET /api/notify/trpc/notify.list`,
`GET /api/notify/trpc/notify.unreadCount`. Mutations use the same prefix with
POST. Edge strips `/api/notify` and forwards the rest; auth is the edge-signed
principal header (same as every other mounted service).

## Events

**Publishes**

_None in v1._

**Consumes**

| Subject                           | Consumer (durable)         | Effect                                      |
| --------------------------------- | -------------------------- | ------------------------------------------- |
| `intafaced.trade.fill.settled`    | `notify-fill-settled`      | Inbox row for the fill owner                |
| `intafaced.p2p.escrow.locked`     | `notify-p2p-escrow-locked` | Inbox rows for seller and buyer             |
| `intafaced.identity.kyc.approved` | `notify-kyc-approved`      | Inbox row when verification tier is granted |

Inserts are idempotent (`ON CONFLICT DO NOTHING` on
`(user_id, source_subject, source_idempotency_key)`).

## Ledger

This service holds no balances and posts no ledger transactions.

## Kill-switch

- Env: `NOTIFY_FANOUT_ENABLED` (default on). When off, consumers ack without writing.
- Flag: `notify.fanout` in `packages/config` — operator kill-switch for the module.

## §13 sockets

| Socket             | Why deferred                                |
| ------------------ | ------------------------------------------- |
| Push notifications | Device token store + provider not in v1     |
| Email              | Outbound mail rail not licensed / not wired |
| SMS                | Outbound SMS rail not licensed / not wired  |

## Port

`4015` · schema `notify` · role `svc_notify`
