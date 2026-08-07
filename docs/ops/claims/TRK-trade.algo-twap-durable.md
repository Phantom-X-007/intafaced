# Claim — trade.algo TWAP durable schedule store

**Owner session:** grok trade-twap-durable  
**Paths:** `services/svc-trade/src/algo/**`, `services/svc-trade/src/spot/trade-service.ts`, `services/svc-trade/drizzle/0010_*`  
**Status:** open  
**Class:** M (algo child path already Class M; store is schedule-only)  
**Board-Delta:** Durable algo_parents table + hydrate on get/tickAll; parent still holds no fills.

VWAP/POV still OUT (ADR).
