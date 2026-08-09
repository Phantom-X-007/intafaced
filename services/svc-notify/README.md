# svc-notify

Event-driven notification fan-out for `ops.notifications`. Bus events become
inbox rows, and inbox rows are then attempted on every channel for which the user
has confirmed an address.

This service holds no balances and posts no ledger transactions.

## The one thing to understand

**An attempt and an outcome are two different facts, and this service never
collapses them.** Every (notification, channel) pair gets a row in
`notify.deliveries` carrying both:

| Column         | Means                                    |
| -------------- | ---------------------------------------- |
| `attempted_at` | we handed it to a transport              |
| `accepted_at`  | a transport accepted it **for delivery** |
| `refusal_code` | why we did not even try                  |

So these three situations stay distinguishable, forever, from the record:

- **a transport took it** — `attempted_at` and `accepted_at` both set
- **we tried and it did not work** — `attempted_at` set, `accepted_at` null
- **we never had anywhere to send it** — both null, `refusal_code` says which

A database CHECK enforces `accepted_at IS NOT NULL` exactly when
`status = 'accepted'`, so no future bug can quietly make an undelivered margin
call read as a delivered one. svc-bank keeps `notified_at` apart from `called_at`
for the same reason; this is that discipline one layer out.

### `accepted`, not `delivered` — and why the column was renamed

The column used to be called `delivered_at`, and it was set the moment a gateway
answered 2xx. **A gateway answering 2xx has taken custody of the message.** It
has not said the mail server took it, that the handset was reachable, or that a
human read it — and this service receives no delivery receipts, so it never
learns any of those things.

`accepted` is the strongest statement the code can support, so it is the word
the status and the column use (migration `0002_notify_delivery_accepted`).

This is not pedantry. svc-bank stamps a margin call `notified_at` and runs the
liquidation grace clock off that stamp. A word that decides whether somebody's
collateral is sold must mean exactly what it says, and nothing downstream should
read `accepted` as "the borrower knows".

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

**A channel the deployment DEPENDS ON is a different case, and it is fatal.**
`NOTIFY_REQUIRED_CHANNELS` lists the out-of-app channels this deployment cannot
do without; anything on it whose pair of variables is missing stops the boot,
naming the variable. In `APP_ENV=staging|prod` the variable itself has no default
and its absence stops the boot too — write `none` to record "in-app only, on
purpose". Same posture as `EDGE_PRINCIPAL_SECRET`, for the same reason: an
honest refusal on every message is still a silent outage if nobody reads the
delivery table. Dev and test require nothing, so no gateway is needed to run the
stack or the suite.

**No provider is named anywhere in this service** (§0.7). The transport is a URL
and a bearer token the owner sets; whoever answers that URL — a mail relay, a
push service, an SMS aggregator, the owner's own forwarder — is configuration.
That also makes changing provider an env change rather than a release.

What the owner has to obtain, in plain language:
[`docs/OWNER-ACTIONS-NOTIFY-GATEWAYS.md`](../../docs/OWNER-ACTIONS-NOTIFY-GATEWAYS.md).

### The gateway contract

Every channel sends the same request shape and differs only in the body:

```
POST <gateway url>
authorization: Bearer <token>
idempotency-key: <notificationId>:<channel>
content-type: application/json
```

| Channel | Body                                                                                           |
| ------- | ---------------------------------------------------------------------------------------------- |
| `email` | `channel, notificationId, to, locale, severity, kind, subject, text, href, titleKey, bodyKey`  |
| `push`  | `channel, notificationId, to, locale, severity, kind, title, body, titleKey, bodyKey, data{…}` |
| `sms`   | `channel, notificationId, to, locale, severity, kind, text, titleKey, bodyKey`                 |

`push.data` carries `{ href, kind, notificationId }` — the routing facts the app
needs to open the right screen, kept out of the two fields a push service shows a
user.

Copy arrives **already rendered**, server-side, from `@intafaced/i18n` — so an
out-of-app message can never carry copy a screen could not (§9) or copy the brand
scan has not seen (§0.7). The keys ride along for a gateway with its own
templates.

**Addresses are validated per channel before anything is sent.** A mailbox with
no domain, a phone number that is not E.164, a device token containing
whitespace: all refused with `channel.target_unroutable`, and no request is made.
A gateway handed a local-format number still sends it somewhere, and which
country that somewhere is in is the carrier's guess, not ours.

**SMS is composed and capped.** One `text` field, `title: body href`, cut to
`NOTIFY_SMS_MAX_CHARS` (480 — three GSM segments) from the body outwards so the
fact and the link survive. SMS is billed per segment; an unbounded body is an
unbounded bill.

**Responses.** Any 2xx is acceptance; `{"id": "..."}` is stored as the reference,
and a 2xx with no body is accepted with a null reference. 408 / 425 / 429 / 5xx
are retried. Other 4xx are not — including **401 / 403, deliberately**: a rejected
credential rejects every message, so retrying turns one bad token into three
times the traffic against somebody's auth endpoint and a plausible IP block.
A redirect is **not followed** (`redirect: 'error'`), so the bearer token never
reaches a host the owner did not configure.

**Retries are bounded by `NOTIFY_MAX_DELIVERY_ATTEMPTS` and by nothing else.**
The adapters contain no retry loop of their own — the bound lives in the
`notify.deliveries` claim, which is in the database and therefore survives the
process dying mid-attempt. `src/channels/gateway-wire.test.ts` counts the
requests **at the server** to prove it, because an attempt counter we keep
ourselves is exactly the number that would still look right if an adapter
retried underneath it.

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

| Procedure               | Scope          | Input                              | Output                                                                                  |
| ----------------------- | -------------- | ---------------------------------- | --------------------------------------------------------------------------------------- |
| `health`                | public         | —                                  | `{ ok, service, fanoutEnabled }`                                                        |
| `notify.list`           | `notify:read`  | `{ cursor?, limit?, unreadOnly? }` | `{ items, nextCursor }`                                                                 |
| `notify.unreadCount`    | `notify:read`  | —                                  | `{ count }`                                                                             |
| `notify.markRead`       | `notify:write` | `{ ids: uuid[] }`                  | `{ marked }`                                                                            |
| `notify.markAllRead`    | `notify:write` | —                                  | `{ marked }`                                                                            |
| `notify.channels`       | `notify:read`  | —                                  | per-channel availability + missing env                                                  |
| `notify.targets`        | `notify:read`  | —                                  | the caller's registered addresses                                                       |
| `notify.registerTarget` | `notify:write` | `{ channel, address, locale? }`    | `{ status, channel, code, expiresAt }` — rate-limited (`channel.register_rate_limited`) |
| `notify.verifyTarget`   | `notify:write` | `{ channel, code }`                | `{ verified, code }` — rate-limited (`channel.verify_rate_limited`)                     |
| `notify.removeTarget`   | `notify:write` | `{ channel }`                      | `{ removed }`                                                                           |
| `notify.deliveries`     | `notify:read`  | `{ notificationId }`               | per-channel attempt + outcome                                                           |
| `notify.mutePrefs`      | `notify:read`  | —                                  | per-channel mute flags (email/push/sms)                                                 |
| `notify.setMute`        | `notify:write` | `{ channel, muted }`               | updated mute flags                                                                      |

Every procedure is self-only via `principal.userId`. Title/body are i18n keys
(`title_key` / `body_key`); clients render copy from `@intafaced/i18n`
(`notify.*` keys). `notify.deliveries` is user-facing on purpose: if a margin
call's email never went out, the person whose collateral is at risk is the one
who most needs to see it.

**Mute law.** `notify.setMute` silences out-of-app `info` / `action` traffic on
one channel. Prefs live in `notify.channel_mutes` (migration `0003`) so a restart
cannot silently unmute. **Critical** severity never respects mute — a muted
email channel still receives margin calls, and the delivery row says `accepted`
or a real refusal, never `channel.muted`.

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
| `intafaced.trade.position.updated`   | `notify-position-updated`    | **Critical** inbox row + fan-out on liquidation only       |
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
other channels handled perfectly. After `NOTIFY_MAX_DELIVERY_ATTEMPTS` the row is
`abandoned` rather than left looking like it is still being retried.

**Two things write `abandoned`, and the second one is why the first sentence is
true.** The claim retires a spent row when a later redelivery arrives — but a
message that reaches the attempt ceiling and `max_deliver` together is parked by
JetStream, and no later redelivery arrives. A one-minute sweep
(`reapExhausted`, wired in `index.ts`) retires those rows on the same predicate
the claim uses, **and** retires stuck-`pending` rows whose claim lease has been
dead longer than the bus redelivery window (`STUCK_PENDING_GRACE_MS` =
maxDeliver × ack_wait). That second arm closes the hole where `in_flight` naks
burn `max_deliver` without raising `attempts`, so the attempts-ceiling arm never
fires and the row would otherwise sit `pending` forever. It writes only a failure
— never an attempt, never an acceptance — and never touches a row whose claim
lease is still live.

**Register / verify rate limits.** Per `userId`+channel sliding windows (default
3 registers / 10 verifies per 15 minutes). Named refuse codes, not silent drops.
Production stores the window in Postgres (`notify.target_rate_windows`, migration
`0005`) and claims it with `SELECT … FOR UPDATE`, so two replicas share one
budget rather than each holding an N× in-process counter. Unit tests may still
inject the memory limiter.

**Consent footer.** Out-of-app bodies from `renderNotification` append
`notify.channel.footer` (catalog). Verification messages do not (address is still
unconfirmed).

`intafaced.bank.margin_call.created` is keyed `<loanId>:<sequence>`, not
`<loanId>` — a loan can be called, cured and called again, and the second call is
a different fact.

### `trade.position.updated` — one transition of four

That subject is published on **every** futures position transition, and again
when a moving mark price liquidates one. Fanning all of them out would put an
inbox row, and for anyone with a confirmed address an email, behind every open
and every close a trader makes. An inbox nobody reads is the same outage as an
inbox nothing writes to, so the consumer notifies on `liquidated` **only**:
opening, closing and closed are things the trader just did, and a liquidation is
the one that happened to them while they were not looking.

Which other transitions deserve a message is product law and has not been
decided. It lives in `DEFAULT_POSITION_NOTIFY_POLICY` (`src/events.ts`) as a
policy object with the conservative default, rather than as an `if` — widening
it is a change to `statuses` plus two i18n keys per new state. It is
deliberately **not** an environment variable: which notifications exist is a
product fact that should read the same in every deployment.

The row is `critical` for the same reason the margin call is: refusals get
recorded on every out-of-app channel even when the trader registered none, and a
channel mute does not silence it. The key is `<positionId>:<status>`, so a
widened policy cannot collapse two transitions of one position into one row —
and `ts` is deliberately not part of it, so a producer re-publishing with a
fresh timestamp cannot turn a duplicate into a second liquidation notice.

A `critical` notification records a refusal on **every** out-of-app channel even
when the user registered none, so "we had no way to reach you" is a row written
at the moment it mattered rather than an inference from an empty table later.

### Consumers whose stream does not exist yet

A durable consumer cannot be created against a stream no service has published
to. When that happens the consumer is reported as **pending** on `GET /ready` and
logged at info (declared wiring socket) or error (undeclared defect), rather than
failing the whole boot or being skipped in silence. Nothing is lost: JetStream
retains 90 days and the consumer replays from the start of the stream on a later
boot.

`intafaced.bank.margin_call.created` used to sit in that state; svc-bank now
owns the bank stream and publishes margin calls. The consumer attaches when the
stream is present — pending is no longer the steady state for that subject.

## Ledger

This service holds no balances and posts no ledger transactions.

## Kill-switches

| Switch                      | Effect                                                                       |
| --------------------------- | ---------------------------------------------------------------------------- |
| `NOTIFY_FANOUT_ENABLED`     | Off: consumers ack, nothing is written, nothing is sent anywhere.            |
| `NOTIFY_OUT_OF_APP_ENABLED` | Off: inbox still fills; every out-of-app channel refuses `channel.disabled`. |
| flag `notify.fanout`        | Module kill-switch in `packages/config`.                                     |

The second is the one to reach for during an incident — it silences customers'
phones without also blinding them. It may **not** be combined with a non-empty
`NOTIFY_REQUIRED_CHANNELS`: a deployment that requires a channel and switches all
sending off is a contradiction, and it is the shape a bad rollback takes. The env
schema refuses it.

## Environment

| Variable                                | Default | Notes                                                                  |
| --------------------------------------- | ------- | ---------------------------------------------------------------------- |
| `NOTIFY_{EMAIL,PUSH,SMS}_GATEWAY_URL`   | —       | Unset ⇒ the channel refuses `channel.not_configured`.                  |
| `NOTIFY_{EMAIL,PUSH,SMS}_GATEWAY_TOKEN` | —       | ≥16 chars. A URL without a token refuses to boot: it is an open relay. |
| `NOTIFY_REQUIRED_CHANNELS`              | —       | Subset of `email,push,sms`, or `none`. **Mandatory in staging/prod.**  |
| `NOTIFY_GATEWAY_TIMEOUT_MS`             | `5000`  | Budget for one gateway call.                                           |
| `NOTIFY_MAX_DELIVERY_ATTEMPTS`          | `3`     | 1–5, at or below the bus `maxDeliver`.                                 |
| `NOTIFY_SMS_MAX_CHARS`                  | `480`   | Three GSM segments.                                                    |
| `NOTIFY_VERIFY_TTL_MINUTES`             | `15`    | Life of an address-confirmation code.                                  |

An empty string is treated as absent, because that is what `docker compose`
interpolates an unset variable to — otherwise an unwired gateway would fail
`z.string().url()` and take the service down instead of leaving the channel
honestly unconfigured.

## §13 sockets

| Socket | State                                                                                                                                            |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Email  | Adapter shipped and tested against a real HTTP server. **Waiting on credentials the owner must obtain.** Unconfigured, it refuses every message. |
| Push   | Same. Device tokens register and confirm per user; no push credentials configured.                                                               |
| SMS    | Same. Addresses are E.164, text is composed and capped; no SMS credentials configured.                                                           |

None of these is a code gap. Each is a URL and a token away from working, and
until then the in-app inbox carries every notification and the record says why
nothing else did. The owner's list of what to obtain and where to put it:
[`docs/OWNER-ACTIONS-NOTIFY-GATEWAYS.md`](../../docs/OWNER-ACTIONS-NOTIFY-GATEWAYS.md).

## Port

`4015` · schema `notify` · role `svc_notify`
