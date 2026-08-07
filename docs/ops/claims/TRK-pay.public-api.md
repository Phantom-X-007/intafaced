# Claim TRK-pay.public-api

**status:** claimed
**owner:** cursor-swarm-pay
**started:** 2026-08-07T09:54:08.099Z
**heartbeat:** 2026-08-07T09:54:08.099Z
**title:** Public REST + webhooks + sandbox (§9) — step 2 mutating paths
**track:** TRACKER
**paths:**

- docs/ops/trk/pay.public-api.md
- services/svc-pay/src/public-rest.ts
- services/svc-pay/src/rest-idempotency.ts
- services/svc-pay/drizzle/0007_pay_rest_idempotency.sql

## Done bar

- [ ] Implemented
- [ ] claim:check clean or residual-owned
- [ ] pnpm verify (or FE-VERIFY when available)
- [ ] Proof: fleet OR proof_missing: fleet-blocked (NO-FLEET)
- [ ] PR link

## Law

- Do not hand-edit docs/LIVE-LANES.md mid-wave (inside Denon open PRs).
- Do not invent money/depth. No Shehzad implement. No dual-edit Denon open files.
- No Class X PSP/card go-live. Step 2 = mutating REST + Idempotency-Key only.
