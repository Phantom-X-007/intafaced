# TRK-pay.public-api — Public REST + webhooks + sandbox (§9)

**Tracker:** `pay.public-api` · **Class:** M · **Law:** [`docs/adr/2026-08-07-pay-public-api-law.md`](../../adr/2026-08-07-pay-public-api-law.md)

## Sequence (ADR §4)

| Step | Slice                                                                                            | Status                                                           |
| ---- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| 1    | REST translation + OpenAPI + auth — **read paths** (`get` / `list` / `balances`)                 | tip `#988`                                                       |
| 2    | Mutating paths — `create` / `authorize` / `capture` / `refund` behind required `Idempotency-Key` | tip `#994`                                                       |
| 3    | Webhooks — signing, retry, dedup, failure dashboard                                              | tip `#1006`                                                      |
| 4    | Sandbox keys — route sandbox principal to sandbox rail                                           | tip `#1014`                                                      |
| 5    | Public docs + merchant quickstart                                                                | **this residual** → `docs/pay/MERCHANT-PUBLIC-API-QUICKSTART.md` |

## Merchant surface

```
GET    /api/pay/v1/openapi.json                public
GET    /api/pay/v1/payments/:id                pay:read
GET    /api/pay/v1/payments                     pay:read
GET    /api/pay/v1/balances                     pay:read
POST   /api/pay/v1/payments                    pay:write   + Idempotency-Key
POST   /api/pay/v1/payments/:id/authorize      pay:write   + Idempotency-Key
POST   /api/pay/v1/payments/:id/capture        pay:write   + Idempotency-Key
POST   /api/pay/v1/payments/:id/refund         pay:refund  + Idempotency-Key
POST   /api/pay/v1/webhook-endpoints           pay:write
GET    /api/pay/v1/webhook-endpoints           pay:read
DELETE /api/pay/v1/webhook-endpoints/:id       pay:write
GET    /api/pay/v1/webhook-deliveries          pay:read   (failure dashboard)
```

## Explicitly not this row's Class X

Live card acquiring / sponsor BIN = `socket.psp-partners`. Hyperswitch stays killed (ADR 2026-08-04). Agents ship the API door + docs, not go-live.
