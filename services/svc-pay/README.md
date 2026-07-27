# svc-pay

The payments core (§6.1). Merchants, the payment lifecycle, settlement into the ledger, and the `RailAdapter` interface every external rail sits behind.

**What it is NOT:** it does not hold balances (the ledger does), it does not choose between rails (smart routing is its own feature), and it does not know the name of a single payment processor. Every rail — the two here and every one that comes later — is an implementation of one interface, and `src/rails/conformance.ts` is what keeps that true.

**In this PR:** gateway mode, the adapter interface, `crypto-native`, `card-sandbox`, and the conformance kit.
**Not in this PR** (each a separate tracker feature): PSP mode, PayFac sub-merchant trees, smart routing, fraud scoring, the checkout builder, subscriptions, commerce plugins, disputes.

---

## The lifecycle

```
created ──authorize──▶ authorized ──capture──▶ captured ──settle──▶ settled
   │                        │                      │                   │
   └──────▶ failed ◀────────┘                      └──refund──▶ refunded ◀──refund──┘
```

`payment_events` is the append-only state history. Every transition appends a row; **nothing is ever overwritten**, and the database enforces that with a trigger rather than trusting the application. `payments.status` is a projection of that log, and the captured and refunded totals are summed from it — there is deliberately no `captured_amount` column, because a running total beside an event log is a second source of truth for money.

Where value actually is, at each stage:

| Stage        | Where the money is                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------ |
| `created`    | Nowhere. Nothing has moved.                                                                                  |
| `authorized` | Nowhere in the book. A promise (card) or a confirmed on-chain transfer at an address we control (crypto).    |
| `captured`   | `pay:clearing:<merchantId>` in the ledger. Ours to hold, the merchant's to receive, not yet theirs to spend. |
| `settled`    | The merchant's own `available` balance, minus the fee.                                                       |
| `refunded`   | Back out through the rail boundary it came in on.                                                            |

---

## API

Internal tRPC (`src/router.ts`). Money is a **decimal string** in both directions; the input schema rejects a JSON number.

| Procedure           | Scope        | Input                                                               | Output                                           |
| ------------------- | ------------ | ------------------------------------------------------------------- | ------------------------------------------------ |
| `health`            | public       | –                                                                   | `{ ok, service, rails }`                         |
| `railHealth`        | `pay:read`   | –                                                                   | `RailHealth[]`                                   |
| `merchant.create`   | `pay:write`  | `{ userId, mode, pricing: { feeBps } }`                             | `{ id, userId, mode, feeBps }`                   |
| `merchant.profile`  | `pay:write`  | `{ merchantId, checkoutConfig, feeRouting, domains }`               | `{ id, merchantId }`                             |
| `merchant.balances` | `pay:read`   | `{ merchantId, assetId }`                                           | `{ clearing, available }` — read from the ledger |
| `payment.create`    | `pay:write`  | `{ merchantId, amount, assetId, method, railAdapter, instrument? }` | `Payment`                                        |
| `payment.authorize` | `pay:write`  | `{ paymentId }`                                                     | `Payment`                                        |
| `payment.capture`   | `pay:write`  | `{ paymentId, amount? }`                                            | `Payment`                                        |
| `payment.refund`    | `pay:refund` | `{ paymentId, amount, refundId? }`                                  | `Payment`                                        |
| `payment.get`       | `pay:read`   | `{ paymentId }`                                                     | `Payment`                                        |
| `payment.history`   | `pay:read`   | `{ paymentId }`                                                     | `PaymentEvent[]`                                 |
| `settlement.run`    | `pay:write`  | `{ merchantId, window, assetId }`                                   | `Settlement`                                     |
| `settlement.payout` | `pay:payout` | `{ settlementId, railId, destination }`                             | `Settlement`                                     |
| `settlement.get`    | `pay:read`   | `{ settlementId }`                                                  | `Settlement`                                     |

Refunds and payouts carry their own scopes. Taking a payment and sending money back out are not the same authority.

**HTTP:** `POST /webhooks/:railId` (public, signature-authenticated), `GET /health`, `GET /ready`.

### Error codes

`pay.rail_declined`, `pay.rail_failed`, `pay.capture_exceeds_authorized`, `pay.partial_capture_unsupported`, `pay.refund_exceeds_captured`, `pay.refund_in_flight`, `pay.rail_amount_mismatch`, `pay.invalid_transition`, `pay.nothing_to_settle`, `pay.fee_exceeds_gross`, `pay.merchant_pricing_invalid`, `pay.webhook_invalid`, `pay.webhook_unmatched`.

---

## Events

### `payment_events` — the internal append-only history

This is the state history §6.1 requires, and it is the truth this service reasons from. Ordered by `seq` (a `bigserial`), not by `ts`: every event appended inside one transaction shares a transaction timestamp, and a history that cannot order a capture against a refund is not a history.

| Event                 | Appended when                                                                                                               |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `created`             | A payment row exists. Nothing has moved.                                                                                    |
| `rail.authorize`      | A rail answered an authorization request (ok or not).                                                                       |
| `rail.pending`        | The rail took the request but has not completed it — on `crypto-native`, the transfer has not landed or is not deep enough. |
| `authorized`          | The rail authorized. The amount recorded is what the RAIL authorized.                                                       |
| `rail.capture`        | A rail answered a capture request.                                                                                          |
| `captured`            | Value entered the book. Carries the ledger transaction id.                                                                  |
| `refund.posted`       | The merchant has been debited and a refund is about to be sent.                                                             |
| `rail.refund`         | The rail answered the refund request.                                                                                       |
| `refunded`            | The refund left the rail.                                                                                                   |
| `refund.reversed`     | The rail refused; the ledger posting was reversed.                                                                          |
| `settlement.included` | The payment is frozen into a settlement window.                                                                             |
| `settled`             | The window posted to the merchant's ledger account.                                                                         |
| `failed`              | The rail declined, or a failure webhook arrived.                                                                            |
| `webhook.<type>`      | A verified rail delivery. Carries `rail_event_id`, which is **unique** — this is the dedupe.                                |

### NATS

**svc-pay publishes no NATS subjects yet.** Not an oversight: the bus is a contract, and §15.2 / AGENT_PROTOCOL §2 require a `packages/events` catalog PR — reviewed on its own — before a producer emits anything. `intafaced.pay.payment.captured` and `intafaced.pay.settlement.completed` are the two consumers will want; they land in the catalog first.

**Consumes:** nothing.

---

## Ledger

Every value movement is a recipe. This service holds no balance of any kind (Doctrine §0.6).

| Recipe                 | Reason code               | Accounts                                                               |
| ---------------------- | ------------------------- | ---------------------------------------------------------------------- |
| `paymentCapture`       | `payment.captured`        | rail boundary → `pay:clearing:<merchantId>`                            |
| `merchantSettlement`   | `pay.settled`             | `pay:clearing:<merchantId>` → merchant available + `houseFees('pay')`  |
| `paymentRefund`        | `payment.refunded`        | clearing (pre-settlement) or merchant available (post) → rail boundary |
| `paymentRefundReverse` | `payment.refund.reversed` | rail boundary → back where the refund came from                        |
| `withdrawHold`         | `withdraw.held`           | merchant available → merchant hold (payout in flight)                  |
| `withdrawSettle`       | `withdraw.settled`        | merchant hold → rail boundary (payout completed)                       |
| `withdrawReverse`      | `withdraw.reversed`       | merchant hold → merchant available (payout refused)                    |

**`merchantClearing(merchantId, assetId)`** is a new account constructor: a `module`-owned account per merchant, per asset. It answers "a payment was captured but not settled — whose funds are those?" as a balance rather than an investigation. `sum(merchantClearing(m))` is exactly what svc-pay owes merchant `m` right now, readable from the ledger without touching a single svc-pay table — which is what makes reconciliation between the two meaningful.

### Idempotency keys — all business keys, never random

| Key                                                       | Governs                                                                  |
| --------------------------------------------------------- | ------------------------------------------------------------------------ |
| `payment.capture:<paymentId>`                             | A payment is captured once, however many times the webhook is delivered. |
| `payment.refund:<refundId>`                               | One refund, one posting. `<refundId>` defaults to `<paymentId>:<n>`.     |
| `payment.refund.reverse:<refundId>`                       | The reversal of that refund.                                             |
| `settlement:<merchantId>:<window>:<assetId>`              | A window settles once, per asset.                                        |
| `withdraw.hold\|settle\|reverse:<settlementId>:<attempt>` | One payout attempt.                                                      |

> **Why the asset is in the settlement key.** §6.1's settlement is keyed on merchant and window. A merchant taking USDT and BTC on the same day has two settlements, and without the asset in the key the second would find the first's transaction, return it, and strand a whole currency's takings in clearing. The `settlements` table carries an `asset_id` column for the same reason: `gross`/`fees`/`net` are meaningless without one.

### Order of operations, and whose funds are stranded

The direction of the money decides the order:

- **Inbound (capture):** the rail moves first, the ledger books second. We only book value we know has arrived. A crash in between leaves money captured at the rail and not yet in the book — the classic. Nothing is lost: both halves are keyed on the payment id, so re-running finishes the job.
- **Outbound (refund, payout):** the ledger moves first, the rail second. The merchant must be shown to have the money before any of it goes somewhere irreversible; a post-settlement refund they cannot cover fails at the ledger, before the rail is asked. A crash in between leaves the book correct and only the status projection behind. If the rail then refuses, the ledger posting is reversed in the same call.

A refund whose id is already in flight is **refused**, not re-sent: `RailAdapter.refund(ref, amount)` carries no refund id (§6.1), so the rail cannot dedupe it for us, and "send it again and hope" is how one refund becomes two.

---

## Rails

`src/rails/rail-adapter.ts` is the interface, exactly as §6.1 specifies — `id`, `capabilities`, `authorize`, `capture`, `refund`, `payout`, `verifyWebhook` — plus `health()`, taken from the shape `packages/venue-adapter` already uses for liquidity venues.

| Adapter         | What it is                                                                                                                                                                                                              |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `crypto-native` | **Real.** Accepts on-chain assets and settles them to the ledger. Talks to `CryptoChainPort`, never to a node directly.                                                                                                 |
| `card-sandbox`  | A **mock acquirer**, not a mock adapter. The state machine, decline codes, refund arithmetic, signed webhooks and idempotency are all real; only the counterparty is simulated. It runs the full flow end to end in CI. |

### `crypto-native`: authorize and capture are not what they are on a card

A chain has no auth hold and nothing to complete. So:

- **authorize** means "a transfer to this payment's acceptance address has reached `minConfirmations`". Below the threshold the answer is `pending`, not `authorized` — a shallow transaction can still be reorganised away, and a merchant who ships against one has shipped against nothing.
- **capture** is an accounting act, and it re-reads the chain rather than trusting a decision made minutes ago. A reorg between the two is caught.

It also handles what payers actually do: **underpayment** and **wrong token to the right address** both fail the payment while reporting the address, the transaction and the sender, so the funds are recoverable rather than merely lost. An **overpayment** is booked at what arrived, because booking less would strand the difference.

### Webhook verification

Constant-time, via `crypto.timingSafeEqual`, over the **raw body** signed together with a timestamp. Length is checked separately first, because `timingSafeEqual` throws on a length mismatch and an unhandled exception on a public endpoint is a denial-of-service surface. Non-hex signatures are rejected outright: `Buffer.from('zz','hex')` is empty, and two empty buffers compare equal — a signature of nothing verifying nothing. Stale timestamps are replays. Nothing throws, whatever arrives.

A verified delivery is still shape-checked: an amount that is a JSON number is rejected even when the signature is perfect.

### Adding a rail — the conformance kit (§6.3)

```ts
import { runRailAdapterConformance } from '@intafaced/svc-pay/rails';

runRailAdapterConformance('acme-acquirer', async () => ({
  adapter: new AcmeAcquirerAdapter({ ... }),
  reset: async () => { ... },
  primeAuthorization: async (intent) => { ... },
  signWebhook: (event) => ({ ... }),
  signRaw: (body) => ({ ... }),
  failNext: () => { ... },
  payoutDestination: () => ({ kind: 'bank', ref: '...' }),
}));
```

**Any future adapter must pass this kit before merge.** It asserts identity and capability declaration, health and staleness, the `RailResult` contract (`ok === (status !== 'failed')`, money is always a bigint, a failure always carries a machine-readable code), authorize/capture/refund/payout idempotency on business keys, refund arithmetic including over-refund across partials, webhook verification against tampering, forged and wrong-length signatures, replay, garbage and correctly-signed-but-malformed payloads, and that rail failures surface as results rather than exceptions and leave nothing half-done.

What the kit asserts is exactly what the core is entitled to assume. That is what makes §6.1's "drop in later as adapters with zero core changes" a testable claim instead of a hope.

---

## Kill-switch

`module.pay` in the admin console — the module kill-switch beats every other flag (`packages/config/src/flags.ts`). With it off, no procedure in this service serves. `pay.payfac` and `pay.laneA` gate features not built here.

---

## Running it

```bash
pnpm --filter @intafaced/svc-pay db:migrate      # apply, --down to reverse
pnpm --filter @intafaced/svc-pay test            # needs Postgres on :5433; skips cleanly without it
pnpm gate svc-pay
```

Tests run against real Postgres (`postgres://svc_pay:svc_pay@localhost:5433/intafaced`) with `MemoryLedger` as the ledger — legitimate because the ledger conformance suite proves the reference implementation and svc-ledger's Postgres engine behave identically (§4.4). Postgres is real because the payment row / event log / ledger interaction is exactly where a bug would hide, and because the append-only guarantee is a database trigger an in-memory fake would quietly not have.
