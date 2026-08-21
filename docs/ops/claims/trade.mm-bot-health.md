# Claim trade.mm-bot (seed health)

**status:** LIVE this session
**tracker:** `trade.mm-bot` (stays **ready** — jobs default OFF; no invented markets/mids)
**branch:** `feat/mm-seed-health-surface`
**class:** N

svc-trade `GET /health` reports MM seed `enabled` / `armed` / `targetCount` using existing `mmSeedJobsArmed`. Off or empty targets never look live. Does not 503. Does not flip `TRADE_MM_SEED_ENABLED`.

## Leverage

Phase A IN: existing `seed-honesty` + `/health`. Horizon `trade.mm-bot` = IN.

## Non-goals

- Default jobs ON
- Invent `TRADE_MM_SEED_MARKETS`
- Dual-edit #1830 svc-ws
- Vue
