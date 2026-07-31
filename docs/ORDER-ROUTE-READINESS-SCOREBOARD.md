# Order-route readiness scoreboard

**Status:** LIVING · agent program finish gate  
**Program plan:** `ORDER-ROUTE-PLAN-2026-07-31.md`  
**Finish gate:** `ORDER-ROUTE-PROGRAM-FINISH-2026-07-31.md`  
**Rule:** Never say “stable for real money” unless agent axes green **and** Human X residual named.

| Axis                     | Status              | Proof                                       | Notes                      |
| ------------------------ | ------------------- | ------------------------------------------- | -------------------------- |
| Law / DIRECTION          | **green**           | #272                                        | P0-1                       |
| LIVE-LANES               | **LIVE**            | order-route-harden                          | P0-2                       |
| Residual seed-first      | **green**           | campaign R6                                 | P0-3                       |
| CEX unit guard           | **CI**              | svc-trade suite                             | P1-0                       |
| CEX chaos F1–F8          | **landed**          | chaos + seed tests                          | P1-1, P1-4                 |
| CEX properties           | **landed**          | fast-check                                  | P1-2                       |
| CEX assembled            | **honest residual** | order-path-smoke                            | fleet two-user residual    |
| CEX reconcile            | **landed**          | reconcileOrder                              | P1-5                       |
| Dual-book scans          | **green**           | vendor-java-money + door-scan               | P2-2/3                     |
| Dual-book door + service | **landed**          | interceptor + throws                        | P2-4; dead-branch residual |
| Dual-book ADR            | **Accepted**        | DIRECTION #272 era                          | P2-5                       |
| DEX honesty              | **green on tip**    | quote suite + routePreview test             | P3                         |
| Seed honesty             | **partial green**   | flag + kill + tape + make-only              | seeder boot residual P4-1  |
| Multi-asset              | **green on tip**    | migrations + schedule refuse tests          | MA-2/3                     |
| Pay durable              | **green on tip**    | #266 broadcast journal                      | PY-1                       |
| Futures/copy bounds      | **honest**          | tracker futures 🔨 not done; no copy invent | FT-1…4                     |
| WAVE-AUDIT               | **this wave**       | ORDER-ROUTE-PROGRAM-FINISH                  | SC-5                       |
| **Human X**              | **human**           | secrets / go-live / prod RPC / kill drill   | SC-4 · never agent-green   |

**Last update:** 2026-07-31 — Agent finish gate written. **Not go-live. Not stable-for-real-money.**

## Anti-compromise checklist

| Tier A item               | Status               |
| ------------------------- | -------------------- |
| REQ-driven PRs            | yes                  |
| Chaos F1–F8               | yes                  |
| Assembled smoke honest    | yes                  |
| Java mutator + door scans | yes                  |
| fast-check                | yes                  |
| Fresh adversarial         | yes on Class M ships |
| Door-kill A1              | yes                  |
