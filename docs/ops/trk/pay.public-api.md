# TRK-pay.public-api — Public REST + webhooks + sandbox (§9)

**Tracker:** `pay.public-api` · **Class:** M · **Law:** [`docs/adr/2026-08-07-pay-public-api-law.md`](../../adr/2026-08-07-pay-public-api-law.md)

## Sequence (ADR §4)

| Step | Slice                                                                                            | Status            |
| ---- | ------------------------------------------------------------------------------------------------ | ----------------- |
| 1    | REST translation + OpenAPI + auth — **read paths** (`get` / `list` / `balances`)                 | tip `#988`        |
| 2    | Mutating paths — `create` / `authorize` / `capture` / `refund` behind required `Idempotency-Key` | tip `#994`        |
| 3    | Webhooks — signing, retry, dedup, failure dashboard                                              | **this residual** |
| 4    | Sandbox keys — route sandbox principal to sandbox rail                                           | not this PR       |
| 5    | Public docs + merchant quickstart                                                                | not this PR       |

## Step 3 surface

```
POST   /api/pay/v1/webhook-endpoints           pay:write
GET    /api/pay/v1/webhook-endpoints           pay:read
DELETE /api/pay/v1/webhook-endpoints/:id       pay:write
GET    /api/pay/v1/webhook-deliveries          pay:read   (failure dashboard)
```

HMAC-SHA256 over `timestamp + "." + raw body` → `X-Intafaced-Signature` (+ `X-Intafaced-Timestamp`). At-least-once with event id dedupe. Retry/backoff; permanently failing endpoints disabled. Body carries payment **state**, not instructions. Enqueued after money commits via `PayService.afterPaymentEvent` — webhooks never move value.

## Explicitly not this row's Class X

Live card acquiring / sponsor BIN = `socket.psp-partners`. Hyperswitch stays killed (ADR 2026-08-04). Agents ship the API door + outbound notify, not go-live.
