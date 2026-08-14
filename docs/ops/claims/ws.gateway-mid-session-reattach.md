# Claim ws.gateway (mid-session bus re-attach)

**status:** LIVE this session
**tracker:** `ws.gateway` (stays **ready**)
**branch:** `feat/ws-mid-session-reattach`
**class:** N

When NATS is gone for good (`closed()`), drop `tradesBus` / `privateBus` and re-attach. Depth keeps serving. Do not invent a liveness probe during TCP reconnect.

## Leverage

Existing `createBusLifecycle` + `JetStreamEventBus`. No second gateway.

## Non-goals

- Dual-edit `#1822` / `#1823` / `#1824`
- Inventing extra WS streams
