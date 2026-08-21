# Claim trade.algo (cancel-fail does not leave parent active)

**status:** LIVE this session
**tracker:** `trade.algo` (stays **ready** — jobs default OFF; VWAP/POV not invented; icebergs out)
**owner session:** Denon agent
**class:** M
**branch:** `feat/trade-algo-cancel-fail-parent`
**scope:** `services/svc-trade/src/algo/**` + `cancelAlgo` wire in `trade-service.ts`

If a child cancel fails, the parent must not stay tradable (`active` on the durable store / `listActive`) as if cancel succeeded. Engine already parks `paused` + `haltReason cancel_incomplete`; persist that park before rethrowing.

## Leverage

Phase A IN: existing `services/svc-trade/src/algo`. Horizon `trade.algo` = IN. No second scheduler, no VWAP/POV invent.

## Non-goals

- `TRADE_ALGO_JOBS_ENABLED` default ON
- VWAP/POV invent / icebergs
- Mountain-done on `trade.algo`
- Dual-edit #1841 svc-agents, #1842 svc-bank, #1843 packages/venue-adapter, #1844 svc-ws, svc-academy ambassadors, svc-pay KYB
