# pay.plugins — reference path (not three CMS plugins)

**Date:** 2026-08-10 · **Wave:** 13 L02 · **Closed:** D26-P1-P8 2026-08-12 · **Class:** N

## Decision

We do **not** ship WooCommerce / Magento / OpenCart PHP plugins in this monorepo.

House ruling (Phase B + harvest): _wrong stack; residual craft on our API._

**Product path that ships (D26-P1-P8 Done bar — one real plugin path):**

1. **TypeScript reference client** — `services/svc-pay/src/plugins/reference-client.ts`  
   Builds public API requests with the real contract pins (Bearer key, Idempotency-Key, decimal-string amounts, `/api/pay/v1` paths).
2. **Payment lifecycle helpers** — create / get / authorize / capture / refund.
3. **Webhook install path** — register endpoint (https only), list endpoints, list deliveries, verify HMAC vectors.
4. **Frozen webhook signature vectors** — `services/svc-pay/src/plugins/webhook-vectors.ts`  
   HMAC-SHA256 over `timestamp + "." + raw body`; must match `rails/webhook-signature.signPayload` and outbound `X-Intafaced-Signature`.
5. **Tests that fail when the contract breaks** — `reference-client.test.ts`.

Store plugins (Woo/Magento/OpenCart) are **downstream** of this client: they call the same paths, amounts, and webhook verify. First-party PHP CMS packages are a **§13 socket** (see law §13), not a monorepo CI tree.

## Done bar

- One real integration path exists in-repo (TS reference client).
- Authorize / capture / refund money POSTs require Idempotency-Key.
- Webhook registration refuses non-https URLs (matches merchant-webhooks refuse path).
- Webhook vectors verify against the core signer.
- Amount-as-number and missing Idempotency-Key are refused by the client helpers.
- No invented PHP tree, no second money book, no invent fees.

## Not this mountain

| Item                         | Why parked                        |
| ---------------------------- | --------------------------------- |
| PHP Woo/Magento/OpenCart     | Wrong stack; §13 socket (law §13) |
| `pay:*` grant path           | Nitro DIRECTION §8                |
| Live acquirer plugin listing | Class X / partner                 |

## §13 socket (CMS plugins)

Opened on tip for D26-P1-P8: first-party Woo / Magento / OpenCart packages live outside this monorepo's TypeScript CI set. Any future PHP package/repo must pin to this reference client's paths + vector tests as the contract gate. Until then this document + the TS client **are** `pay.plugins` product Done (reference path).
