# Order-route readiness scoreboard

**Status:** LIVING · agent program finish gate  
**Program plan:** `ORDER-ROUTE-PLAN-2026-07-31.md`  
**Finish gate:** `ORDER-ROUTE-PROGRAM-FINISH-2026-07-31.md`  
**Rule:** Never say “stable for real money” unless agent axes green **and** Human X residual named.

| Axis                     | Status              | Proof                                         | Notes                      |
| ------------------------ | ------------------- | --------------------------------------------- | -------------------------- |
| Law / DIRECTION          | **green**           | #272                                          | P0-1                       |
| LIVE-LANES               | **LIVE**            | order-route-harden                            | P0-2                       |
| Residual seed-first      | **green**           | campaign R6                                   | P0-3                       |
| CEX unit guard           | **CI**              | svc-trade suite                               | P1-0                       |
| CEX chaos F1–F8          | **landed**          | chaos F1–F7 + seed F8; F6 process-restart     | P1-1, P1-4 · residual all-out 2026-08-02 |
| CEX properties           | **landed**          | fast-check                                    | P1-2                       |
| CEX assembled            | **honest residual** | order-path-smoke L1 health + L2 auth env      | Docker host + tokens residual |
| CEX reconcile            | **landed**          | reconcileOrder                                | P1-5                       |
| Dual-book scans          | **green**           | java-money + door + **path unit**             | P2-2/3 · path unit 2026-08-02 |
| Dual-book door + service | **landed**          | interceptor + throws; LIVE classify → **10**  | M7 shehzad H-OR-JAVA       |
| Dual-book ADR            | **Accepted**        | DIRECTION #272 era                            | P2-5                       |
| DEX honesty              | **green on tip**    | quote suite + routePreview test               | P3                         |
| Seed honesty             | **green (code)**    | flag + kill + tape + make-only; seeder on tip | ops compose boot residual  |
| Multi-asset              | **green on tip**    | migrations + schedule refuse tests            | MA-2/3                     |
| Pay durable              | **green on tip**    | #266 broadcast journal                        | PY-1                       |
| Futures/copy bounds      | **honest**          | tracker futures 🔨 not done; no copy invent   | FT-1…4                     |
| WAVE-AUDIT               | **this wave**       | ORDER-ROUTE-PROGRAM-FINISH                    | SC-5                       |
| **Human X**              | **human**           | secrets / go-live / prod RPC / kill drill     | SC-4 · never agent-green   |

**Last update:** 2026-08-02 — Residual all-out program (F6 restart, door path unit, smoke L2, LIVE classify). **Not go-live. Not stable-for-real-money.**

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
