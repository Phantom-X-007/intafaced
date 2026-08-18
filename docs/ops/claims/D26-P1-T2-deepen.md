# Claim D26-P1-T2 deepen

- **Lane:** `denon-d26-p1-t2-otc-deepen`
- **Tracker:** `trade.otc`
- **Branch:** `feat/d26-p1-t2-otc-deepen`
- **Scope:** `services/svc-trade/src/otc/**` + OTC procedures in `services/svc-trade/src/router.ts`
- **Done bar deepen:** quoted price scale honesty (`div` not raw `/`); wire `.strict()` refuse on caller-supplied mid; HTTP mount reachability
- **Path-disjoint from T9:** no `instruments` / `spot/**` / `mm/**` / contracts enums
- **Class:** M (quote disclosure is the customer decision surface)
