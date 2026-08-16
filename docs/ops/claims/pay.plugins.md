# Claim pay.plugins

**status:** claimed
**owner:** nitro-agents
**started:** 2026-08-16T12:53:00.000Z
**heartbeat:** 2026-08-16T12:53:00.000Z
**branch:** feat/pay-plugins-woocommerce
**title:** WooCommerce CMS adapter on pay.public-api + reference-client
**track:** TRACKER
**paths:**

- plugins/woocommerce-intafaced-pay/
- services/svc-pay/src/plugins/woocommerce-contract.test.ts
- services/svc-pay/src/plugins/cms-unwired.ts
- services/svc-pay/src/plugins/cms-unwired.test.ts
- docs/ops/claims/pay.plugins.md

## Done bar

- [ ] WooCommerce plugin tree creates payment via `/api/pay/v1` (Bearer, Idempotency-Key, decimal-string amounts)
- [ ] Webhook HMAC matches frozen vectors (`verifyMerchantWebhook` / `signMerchantWebhook`)
- [ ] Sandbox vs live key mode (`ifc_test_` / `ifc_`)
- [ ] Contract tests fail if public pins drift
- [ ] No second money book / no PSP invent
- [ ] Magento + OpenCart stay §13 unwired (not this PR)
- [ ] pnpm verify
- [ ] PR link

## Law

- Do not hand-edit docs/LIVE-LANES.md (parallel agents).
- Stay out of #2117 fraud / settlement / rails (read plugins/reference-client + webhook-vectors only).
- Leverage: GF CMS adapter on Phase A `pay.public-api` + reference-client — not a second pay stack.
