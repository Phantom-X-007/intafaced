# svc-notify

Event-driven notification fan-out for `ops.notifications`. Bus events become
inbox rows, and inbox rows are then attempted on every channel for which the user
has confirmed an address.

This service holds no balances and posts no ledger transactions.

## The one thing to understand

**An attempt and an outcome are two different facts, and this service never
collapses them.** Every (notification, channel) pair gets a row in
`notify.deliveries` carrying both:

| Column         | Means                       |
| -------------- | --------------------------- |
| `attempted_at` | we handed it to a transport |
| `delivered_at` | a transport accepted it     |
| `refusal_code` | why we did not even try     |

So these three situations stay distinguishable, forever, from the record:

- **the user was told** — `attempted_at` and `delivered_at` both set
- **we tried and it did not work** — `attempted_at` set, `delivered_at` null
- **we never had anywhere to send it** — both null, `refusal_code` says which

A database CHECK enforces `delivered_at IS NOT NULL` exactly when
`status = 'delivered'`, so no future bug can quietly make an undelivered margin
call read as a delivered one. svc-bank keeps `notified_at` apart from `called_at`
for the same reason; this is that discipline one layer out.

## Channels

Four channels, one interface (`NotificationChannel`, Doctrine §0.4).

| Channel | Transport                              | Needs                                                     |
| ------- | -------------------------------------- | --------------------------------------------------------- |
| `inapp` | the inbox row itself                   | nothing — always available                                |
| `email` | authenticated POST to a configured URL | `NOTIFY_EMAIL_GATEWAY_URL` + `NOTIFY_EMAIL_GATEWAY_TOKEN` |
| `push`  | authenticated POST to a configured URL | `NOTIFY_PUSH_GATEWAY_URL` + `NOTIFY_PUSH_GATEWAY_TOKEN`   |
| `sms`   | authenticated POST to a configured URL | `NOTIFY_SMS_GATEWAY_URL` + `NOTIFY_SMS_GATEWAY_TOKEN`     |

**A channel with no credentials is registered, not omitted.** It refuses every
message with `channel.not_configured`, the refusal lands on the delivery row, and
`GET /ready` and `notify.channels` both name the environment variables that are
missing. Nothing is dropped in silence and nothing reports a send that did not
happen.

**No provider is named anywhere in this service** (§0.7). The transport is a URL
and a bearer token the owner sets; whoever answers that URL — a mail relay, a
push service, an SMS aggregator, the owner's own forwarder — is configuration.
That also makes changing provider an env change rather than a release.

The gateway contract, for whatever the owner puts behind it:

```
POST <gateway url>
authorization: Bearer <token>
idempotency-key: <notificationId>:<channel>
content-type: application/json

{ "channel", "notificationId", "to", "locale", "severity", "kind",
  "title", "body", "href", "titleKey", "bodyKey" }
```

`title` and `body` arrive already rendered, server-side, from `@intafaced/i18n`
— so an out-of-app message can never carry copy a screen could not (§9) or copy
the brand scan has not seen (§0.7). The keys ride along for a gateway with its
own templates. Any 2xx is acceptance; `{"id": "..."}` is stored as the reference.
408 / 425 / 429 / 5xx are retried, other 4xx are not.

## Addresses

svc-notify owns `notify.channel_targets`. It does **not** read
`identity.users.email` — §2 forbids reaching into another service's tables, and a
login address is not consent to be texted.

Registering an address sends a six-digit code **through the channel being
registered**, which proves the address belongs to the user and proves the channel
works in one step. Nothing is ever sent to an address whose `verified_at` is
null, and changing an address clears its confirmation.

If the channel has no credentials, registration still records the address and
returns `{ status: 'refused', code: 'channel.not_configured' }` — the truth,
rather than a green tick over silence.

## API

| Procedure               | Scope          | Input                              | Output                                 |
| ----------------------- | -------------- | ---------------------------------- | -------------------------------------- |
| `health`                | public         | —                                  | `{ ok, service, fanoutEnabled }`       |
| `notify.list`           | `notify:read`  | `{ cursor?, limit?, unreadOnly? }` | `{ items, nextCursor }`                |
| `notify.unreadCount`    | `notify:read`  | —                                  | `{ count }`                            |
| `notify.markRead`       | `notify:write` | `{ ids: uuid[] }`                  | `{ marked }`                           |
| `notify.markAllRead`    | `notify:write` | —                                  | `{ marked }`                           |
| `notify.channels`       | `notify:read`  | —                                  | per-channel availability + missing env |
| `notify.targets`        | `notify:read`  | —                                  | the caller's registered addresses      |
| `notify.registerTarget` | `notify:write` | `{ channel, address, locale? }`    | `{ status, channel, code, expiresAt }` |
| `notify.verifyTarget`   | `notify:write` | `{ channel, code }`                | `{ verified }`                         |
| `notify.removeTarget`   | `notify:write` | `{ channel }`                      | `{ removed }`                          |
| `notify.deliveries`     | `notify:read`  | `{ notificationId }`               | per-channel attempt + outcome          |

Every procedure is self-only via `principal.userId`. Title/body are i18n keys
(`title_key` / `body_key`); clients render copy from `@intafaced/i18n`
(`notify.*` keys). `notify.deliveries` is user-facing on purpose: if a margin
call's email never went out, the person whose collateral is at risk is the one
who most needs to see it.

### Edge path

Reach this service through **svc-edge** (not direct to port 4015 in production):

| Client path                        | Upstream                                                                              |
| ---------------------------------- | ------------------------------------------------------------------------------------- |
| `GET /api/notify/trpc/<procedure>` | `GET /trpc/<procedure>` on svc-notify (`NOTIFY_URL`, default `http://localhost:4015`) |

Edge strips `/api/notify` and forwards the rest; auth is the edge-signed
principal header (same as every other mounted service).

## Events

**Publishes**

_None._

**Consumes**

| Subject                              | Consumer (durable)           | Effect                                                     |
| ------------------------------------ | ---------------------------- | ---------------------------------------------------------- |
| `intafaced.trade.fill.settled`       | `notify-fill-settled`        | Inbox row for the fill owner                               |
| `intafaced.p2p.escrow.locked`        | `notify-p2p-escrow-locked`   | Inbox rows for seller and buyer                            |
| `intafaced.p2p.escrow.released`      | `notify-p2p-escrow-released` | Inbox rows when escrow releases to buyer                   |
| `intafaced.p2p.escrow.refunded`      | `notify-p2p-escrow-refunded` | Inbox rows when escrow returns to seller                   |
| `intafaced.p2p.trade.disputed`       | `notify-p2p-trade-disputed`  | Inbox row for the opener only (no counterparty on payload) |
| `intafaced.identity.kyc.approved`    | `notify-kyc-approved`        | Inbox row when verification tier is granted                |
| `intafaced.identity.rank.updated`    | `notify-rank-updated`        | Inbox row when rank changes                                |
| `intafaced.token.stake.created`      | `notify-stake-created`       | Inbox row when a stake is locked                           |
| `intafaced.bank.margin_call.created` | `notify-bank-margin-called`  | **Critical** inbox row + fan-out when a loan is called     |

### Idempotency and backpressure

Inserts dedupe on `(user_id, source_subject, source_idempotency_key)`. Each send
claims `(notification_id, channel)` atomically, so a redelivered event produces
one row and one message even across replicas. A redelivery still runs fan-out —
that is what recovers a send lost to a crash between the insert and the
transport.

A handler naks **only** when a channel wants another attempt (timeout, 503). A
permanently broken address does not nak: doing so would burn the redelivery
budget for the whole message and eventually park a notification that three other
channels delivered perfectly. After `NOTIFY_MAX_DELIVERY_ATTEMPTS` the row is
`abandoned` rather than left looking like it is still being retried.

`intafaced.bank.margin_call.created` is keyed `<loanId>:<sequence>`, not
`<loanId>` — a loan can be called, cured and called again, and the second call is
a different fact.

A `critical` notification records a refusal on **every** out-of-app channel even
when the user registered none, so "we had no way to reach you" is a row written
at the moment it mattered rather than an inference from an empty table later.

### Consumers whose stream does not exist yet

A durable consumer cannot be created against a stream no service has published
to. When that happens the consumer is reported as **pending** on `GET /ready` and
logged at warn, rather than failing the whole boot or being skipped in silence.
Nothing is lost: JetStream retains 90 days and the consumer replays from the
start of the stream on a later boot.

`intafaced.bank.margin_call.created` is in exactly that state until svc-bank
connects a bus with `ownedStreams: ['bank']`.

## Ledger

This service holds no balances and posts no ledger transactions.

## Kill-switches

| Switch                      | Effect                                                                       |
| --------------------------- | ---------------------------------------------------------------------------- |
| `NOTIFY_FANOUT_ENABLED`     | Off: consumers ack, nothing is written, nothing is sent anywhere.            |
| `NOTIFY_OUT_OF_APP_ENABLED` | Off: inbox still fills; every out-of-app channel refuses `channel.disabled`. |
| flag `notify.fanout`        | Module kill-switch in `packages/config`.                                     |

The second is the one to reach for during an incident — it silences customers'
phones without also blinding them.

## §13 sockets

| Socket | State                                                                                                                                        |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Email  | Adapter shipped and tested. **Waiting on credentials the owner must obtain.** Unconfigured it refuses every message and records the refusal. |
| Push   | Same. Device tokens register and confirm per user; no push credentials configured.                                                           |
| SMS    | Same. Addresses are E.164; no SMS credentials configured.                                                                                    |

None of these is a code gap. Each is a URL and a token away from working, and
until then the in-app inbox carries every notification and the record says why
nothing else did.

## Port

`4015` · schema `notify` · role `svc_notify`
