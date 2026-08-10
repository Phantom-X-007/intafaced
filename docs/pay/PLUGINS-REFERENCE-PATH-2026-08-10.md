# pay.plugins — reference path (not three CMS plugins)

**Date:** 2026-08-10 · **Wave:** 13 L02 · **Class:** N

## Decision

We do **not** ship WooCommerce / Magento / OpenCart PHP plugins in this monorepo.

House ruling (Phase B + harvest): _wrong stack; residual craft on our API._

**Product path that ships:**

1. **TypeScript reference client** — `services/svc-pay/src/plugins/reference-client.ts`  
   Builds public API requests with the real contract pins (Bearer key, Idempotency-Key, decimal-string amounts, `/api/pay/v1` paths).
2. **Frozen webhook signature vectors** — `services/svc-pay/src/plugins/webhook-vectors.ts`  
   HMAC-SHA256 over `timestamp + "." + raw body`; must match `rails/webhook-signature.signPayload` and outbound `X-Intafaced-Signature`.
3. **Tests that fail when the contract breaks** — `reference-client.test.ts`.

Store plugins (Woo/Magento/OpenCart) are **downstream** of this client: they call the same paths, amounts, and webhook verify. If those CMS wrappers are ever productised, they live outside the monorepo CI language set and consume this package shape.

## Done bar

- One real integration path exists in-repo (TS reference client).
- Webhook vectors verify against the core signer.
- Amount-as-number and missing Idempotency-Key are refused by the client helpers.
- No invented PHP tree, no second money book.

## Not this mountain

| Item                         | Why parked                          |
| ---------------------------- | ----------------------------------- |
| PHP Woo/Magento/OpenCart     | Wrong stack; out of CI language set |
| `pay:*` grant path           | Nitro DIRECTION §8                  |
| Live acquirer plugin listing | Class X / partner                   |

## §13 socket (if CMS plugins become product)

If Nitro later wants first-party CMS plugins: open a socket for a separate package/repo with PHP CI, pinned to this reference client's path + vector tests as the contract gate. Until then this document + the TS client **are** `pay.plugins` product Done (reference path).
