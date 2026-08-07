# Merchant Public API — quickstart

**For merchants integrating payments from their own servers.**  
You do **not** need this monorepo. You need an API key, the OpenAPI document, and this page.

**Law:** [`docs/adr/2026-08-07-pay-public-api-law.md`](../adr/2026-08-07-pay-public-api-law.md)  
**Machine-readable contract:** `GET /api/pay/v1/openapi.json` (no auth)

---

## 1 · Get a key

1. Sign in as the merchant account.
2. Create an API key with scopes you need:
   - `pay:read` — list/get payments, balances, webhook dashboard
   - `pay:write` — create / authorize / capture, register webhooks
   - `pay:refund` — refunds only
3. Choose **mode**:
   - **`sandbox`** — exercises the sandbox rail (`card-sandbox`). Safe for integration tests. Key material looks like `ifc_test_…`.
   - **`live`** — may **not** name a sandbox rail. Production rails only when your deployment has them. Key material looks like `ifc_…`.

The raw key is shown **once**. Store it like a password.

**Withdrawals and treasury are never on long-lived keys** — those require an interactive MFA session.

---

## 2 · Call the edge

```http
Authorization: Bearer ifc_…   (or ifc_test_…)
Content-Type: application/json
```

All merchant routes sit under:

```text
/api/pay/v1
```

The edge exchanges your key for a short-lived principal. The payments service never sees the raw secret.

---

## 3 · Money on the wire

| Rule    | Detail                                                                                         |
| ------- | ---------------------------------------------------------------------------------------------- |
| Amounts | **Decimal strings** with an explicit `assetId` — never minor-unit integers, never JSON numbers |
| Example | One dollar ten → `"1.1"` (canonical; trailing zeros stripped on the way out)                   |
| Compare | Numerically or with a decimal library — never string equality                                  |

---

## 4 · Idempotency (required on every money POST)

Every `POST` that mutates state needs:

```http
Idempotency-Key: <your business key>
```

| Situation                 | Result                                                         |
| ------------------------- | -------------------------------------------------------------- |
| Same key + same body      | Original response (safe retry)                                 |
| Same key + different body | `409` · `pay.idempotency_conflict`                             |
| Missing header            | `400` · `pay.idempotency_required` — **nothing was attempted** |

Use a business id (order id, invoice id), never `randomUUID()` per attempt.

---

## 5 · Payment lifecycle (happy path)

```text
create → authorize → capture → (optional) refund
```

| Step      | Method                         | Scope        | Notes                                                               |
| --------- | ------------------------------ | ------------ | ------------------------------------------------------------------- |
| Create    | `POST /payments`               | `pay:write`  | Body: `merchantId`, `amount`, `assetId`, `method`, `railAdapter`, … |
| Authorize | `POST /payments/:id/authorize` | `pay:write`  | No value moves yet                                                  |
| Capture   | `POST /payments/:id/capture`   | `pay:write`  | Optional partial amount                                             |
| Refund    | `POST /payments/:id/refund`    | `pay:refund` | Own scope on purpose                                                |
| Get       | `GET /payments/:id`            | `pay:read`   |                                                                     |
| List      | `GET /payments?merchantId=`    | `pay:read`   |                                                                     |
| Balances  | `GET /balances?merchantId=`    | `pay:read`   | Clearing + settled                                                  |

### Sandbox vs live rail (step 4)

| Key mode                 | What happens on `create`                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| `sandbox`                | Always routes to the sandbox rail (`card-sandbox`), even if the body names something else   |
| `live` (or missing mode) | Body rail is used; naming `card-sandbox` / `*-sandbox` → `503` · `pay.sandbox_rail_refused` |

There is **no second sandbox stack**. Sandbox is the same API against a simulated rail.

This product surface does **not** mean a live card acquirer is live (Class X / `socket.psp-partners`).

---

## 6 · Webhooks

Register an endpoint your server owns:

```http
POST /api/pay/v1/webhook-endpoints
{ "merchantId": "…", "url": "https://merchant.example/hooks/pay" }
```

Response includes a **signing secret** (once).

### Verify every delivery

1. Read `X-Intafaced-Timestamp` and `X-Intafaced-Signature`.
2. Compute HMAC-SHA256 over the **raw body bytes**:  
   `HMAC_SHA256(secret, timestamp + "." + rawBody)` as hex.
3. Compare signatures in constant time.
4. Reject if the timestamp is too old (replay).

### Delivery guarantees

- **At-least-once** — dedupe on the event `id`.
- Body is **state** (`payment.captured` with current payment shape), not an instruction to charge again.
- Permanent failures: endpoint is disabled; inspect with  
  `GET /api/pay/v1/webhook-deliveries?merchantId=&status=failed`.

Webhooks never move value by themselves.

---

## 7 · Errors

Envelope:

```json
{ "error": { "code": "pay.something", "message": "…" } }
```

Branch on **`code`**, never on `message`. Codes are the internal `pay.*` vocabulary (stable).

Examples you will see early:

| Code                       | Meaning                                                           |
| -------------------------- | ----------------------------------------------------------------- |
| `pay.unauthorized`         | Missing/invalid key or scope                                      |
| `pay.merchant_forbidden`   | That merchant is not yours                                        |
| `pay.idempotency_required` | Mutating POST without `Idempotency-Key`                           |
| `pay.idempotency_conflict` | Same key, different body                                          |
| `pay.sandbox_rail_refused` | Live key named a sandbox rail (or sandbox value movement refused) |
| `pay.validation_failed`    | Bad body (e.g. amount not a decimal string)                       |

---

## 8 · Minimal curl sketch (sandbox)

```bash
# Create (sandbox key forces card-sandbox)
curl -sS -X POST "$BASE/api/pay/v1/payments" \
  -H "Authorization: Bearer $IFC_TEST_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: order:42" \
  -d '{
    "merchantId": "'"$MERCHANT_ID"'",
    "amount": "1.10",
    "assetId": "USD",
    "method": "card",
    "railAdapter": "card-sandbox"
  }'

# OpenAPI (no auth)
curl -sS "$BASE/api/pay/v1/openapi.json" | head
```

Replace `$BASE` with your edge origin. Exact paths and schemas: always prefer **OpenAPI** over this page when they disagree — the document is generated from the running routes.

---

## 9 · What this is not

| Not included                        | Where it lives                      |
| ----------------------------------- | ----------------------------------- |
| Live card acquirer / sponsor BIN    | Class X · `socket.psp-partners`     |
| PayFac trees                        | `pay.payfac`                        |
| Smart routing by geo/approval rates | `pay.routing` (not inventable here) |
| Pricing tiers                       | Commercial, not this API            |

---

## 10 · Done bar (step 5)

A merchant engineer can:

1. Mint sandbox + live keys and tell them apart.
2. Create → authorize → capture using only OpenAPI + this quickstart.
3. Verify a webhook signature without reading service source.
4. Know that amounts are decimal strings and idempotency is mandatory.

If any of those require opening the monorepo, this step is incomplete.
