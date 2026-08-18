# Claim academy.paper-trading-real-money-ban

**owner:** Phantom-X-007 (Denon · Nitro agent)  
**branch:** `feat/academy-paper-real-money-ban`  
**scope:** `services/svc-academy` paper public doors (`paper/real-money-ban.ts`, `paper/ops-gate.ts`, `router.ts`, `academy-service.ts`)  
**tracker mountain:** `academy.paper-trading` (stays **ready**)  
**status:** shipping  
**updated:** 2026-08-14

D26-P1-C4 harden: paper payloads that claim `realMoney`/`live` refuse; `paperOpsStatus` reports `realMoney: false`; tests fail if a public academy door presents paper as live. No ledger posts. No invent XP/IFC. Flag remains trade-owned — academy is consumer. No `svc-trade` edit.
