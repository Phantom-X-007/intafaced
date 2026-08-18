=== INTAFACED Pay ===
Requires at least: 6.2
Requires PHP: 8.1
Requires Plugins: woocommerce
Stable tag: 0.1.0

WooCommerce adapter for the INTAFACED public payments API.

== Description ==

Install this plugin on a WooCommerce store. It does not hold balances and does not talk to a card acquirer.

1. Set API origin, merchant id, API key, and key mode (sandbox vs live).
2. Sandbox keys start with `ifc_test_`. Live keys start with `ifc_`. A mismatch is refused.
3. Checkout POSTs `POST /api/pay/v1/payments` with `Authorization: Bearer`, `Idempotency-Key`, and amount as a JSON string.
4. Configure the webhook URL `https://your-store/wp-json/intafaced-pay/v1/webhook`. Verify `X-Intafaced-Signature` over `timestamp + "." + raw body`.

Magento and OpenCart adapters are not in this package.
