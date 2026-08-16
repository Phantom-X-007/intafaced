# Claim market.commerce — Stage C3 listing subscriptions

**status:** claimed
**Lane:** this session
**Tracker:** `market.commerce` (C1+C2 on main; C3 residual)
**Branch:** `feat/market-commerce-subscriptions-c3`
**Scope:** `services/svc-market/**` only
**Do not touch:** docker-compose · `packages/ledger-client` · ranking/featured · invent `MARKET_HOUSE_COMMISSION_BPS` · pay/bank/identity/agents/ledger agents

## Done bar

- `offerType === 'subscription'` can purchase when commission env is set (same refuse `market.commission_not_configured` when blank).
- Access is time-bounded (period from listing or named refuse if period unset — no default month).
- Cancel stops new access; does not silently refund (no invent reverse recipe).
- Past-due: access refused with a named code, not a fake paid state.
- Public catalogue still honest.
- Tests: purchase, cancel, past-due, unset period, unset commission.

## Leverage

Phase A **IN**: `services/svc-market/src/commerce/commerce-service.ts` purchase path + ledger-client `recipes.marketPurchase`. Horizon `market.commerce`.
