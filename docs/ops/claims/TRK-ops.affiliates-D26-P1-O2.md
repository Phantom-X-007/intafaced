# Claim TRK-ops.affiliates — D26-P1-O2

**Lane:** `d26-p1-o2-affiliates`  
**Owner session:** Phantom-X-007 (Denon)  
**Board:** D26-P1-O2 — Accrual tree under rate authority  
**Branch:** `feat/ops-affiliates-rate-authority`

## Scope

- Durable accrual walks the referral tree only under owner-published
  `IDENTITY_AFFILIATE_ACCRUAL_TIERS_JSON`.
- Unset / unpublished → `affiliate.accrual.rates_unset`.
- Per-call tiers on durable accrue → `affiliate.accrual.invent_refused`.
- Dry-run may simulate tiers (not written).
- Payout remains existing ledger-client recipes only (`sweepFeesToRewards` +
  `rewardPay`) — no new recipes, no invent commissions.

## Do not touch

- `packages/ledger-client` recipe bodies
- Nitro #1746 money-routing graph paths beyond necessary router wire
- Fabricated referral leaderboards / shell UI
