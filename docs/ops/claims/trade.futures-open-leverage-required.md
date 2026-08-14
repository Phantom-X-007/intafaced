# Claim trade.futures (open requires named leverage)

**status:** LIVE this session
**tracker:** `trade.futures` (stays **wip** — funding jobs OFF; D3 ladder; no mountain-done)
**owner session:** Denon agent
**class:** N (honesty) on a Class M door
**branch:** `feat/futures-open-leverage-required`
**scope:** `services/svc-trade/src/private-rest.ts` + CCXT matrix + tests

POST `/api/v1/positions` must not default omitted/non-string `leverage` to `1`. Isolated entry names the leverage or refuses `trade.leverage_required`. Live re-leverage stays 501.

## Leverage

Phase A IN: existing futures open + `checkLeverage` ceiling. Horizon `trade.futures` = IN. No invented cap, no cross margin.

## Non-goals

- Raise max leverage above 10×
- Enable `TRADE_FUTURES_JOBS_ENABLED`
- Dual-edit copy `#1862` (merged), `#1861` svc-agents, `#1851` svc-pay, Shehzad chain
