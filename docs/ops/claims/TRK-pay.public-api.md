# Claim TRK-pay.public-api

**status:** claimed
**owner:** cursor-swarm-pay-w3
**started:** 2026-08-07T11:20:00.000Z
**heartbeat:** 2026-08-07T11:20:00.000Z
**title:** Public REST + webhooks + sandbox (§9) — step 3 outbound webhooks
**track:** TRACKER
**paths:**

- docs/ops/trk/pay.public-api.md
- services/svc-pay/src/merchant-webhooks.ts
- services/svc-pay/src/public-rest.ts
- services/svc-pay/drizzle/0008_pay_merchant_webhooks.sql

## Done bar

- [ ] Implemented
- [ ] claim:check clean or residual-owned
- [ ] pnpm verify (or FE-VERIFY when available)
- [ ] Proof: fleet OR proof_missing: fleet-blocked (NO-FLEET)
- [ ] PR link

## Law

- Do not hand-edit docs/LIVE-LANES.md mid-wave (inside Denon open PRs).
- Do not invent money/depth. No Shehzad implement. No dual-edit Denon open files.
- No Class X PSP/card go-live. Step 3 = signed outbound webhooks + retry + failure dashboard only.
