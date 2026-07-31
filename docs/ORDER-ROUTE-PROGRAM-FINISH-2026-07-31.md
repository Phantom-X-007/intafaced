# Order-route program finish gate (agent-complete)

**Date:** 2026-07-31  
**PR:** https://github.com/Phantom-X-007/intafaced/pull/289  
**Rule:** Agent-complete ≠ go-live. Human X axes stay human forever.

## Definition of finished (this program)

Every Spec v1 REQ is either:

1. **Proven green** with test/scan/PR evidence, or
2. **Honest residual** with named owner, path, and why agent cannot close it.

No REQ left silent. No “stable for real money” claim (RS-2).

---

## REQ close matrix (re-derived this turn)

| REQ          | Status              | Proof / residual                                                                                                  |
| ------------ | ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| GC-1…10      | enforced            | doctrine + scans + worktree + Class M notes                                                                       |
| LW-1…3       | **green**           | #272 · LIVE-LANES · residual seed-first                                                                           |
| CX-1…6,10,12 | **green**           | existing trade suite + CI                                                                                         |
| CX-7 F1–F8   | **green**           | chaos + seed tests                                                                                                |
| CX-8         | **honest residual** | `pnpm order-path-smoke` HONEST_SKIP without fleet; full two-user auth residual                                    |
| CX-9         | **green**           | `reconcileOrder` + tests                                                                                          |
| CX-11        | **green**           | svc-trade README policy                                                                                           |
| DB-1…4       | **partial green**   | door-kill + DAO no-op + service throws + scans; dead-branch setBalance residual                                   |
| DB-5         | **green**           | no reverse write recipe invent; ADR Accepted via #272 era                                                         |
| DX-1…8       | **green on tip**    | svc-dex quote suite (429, degrade, audit fields, no invent)                                                       |
| DX-9         | **green on tip**    | `routePreview` arithmetic test in svc-dex router.mount                                                            |
| SD-1, SD-6   | **residual eng**    | branch `origin/feat/spine-market-seeder` @ `f455d65` (Mongo pin); not rebased/merged this PR — **named residual** |
| SD-2…5       | **green**           | seeded flag · kill-switch · volume exclude · make-only (PO) ban                                                   |
| MA-1…4       | **green on tip**    | multi-asset migrations + `assertMarketOpen` refuse tests already on main path                                     |
| PY-1…2       | **green on tip**    | #266 durable broadcast journal                                                                                    |
| FT-1…4       | **honest**          | tracker `trade.futures` 🔨 not done; copy 🟢 not scaffolded as new product this PR                                |
| SC-1…4       | **green / human**   | custody-scan CI; SC-4 scoreboard human                                                                            |
| SC-5         | **this doc**        | WAVE-AUDIT pointer after money ships on #289                                                                      |
| RS-1…2       | **green**           | living scoreboard; no go-live language                                                                            |

---

## P4-1 seeder residual (evidence, not abandoned)

| Fact                     | Value                                                                               |
| ------------------------ | ----------------------------------------------------------------------------------- |
| Branch                   | `origin/feat/spine-market-seeder`                                                   |
| Tip when checked         | `f455d65` — Mongo driver pin for seeder                                             |
| Entry                    | `vendor/.../seed-market-data.mjs` (mongosh wrapper)                                 |
| Known limit (own header) | seeds history, not live market; thumbnails need market restart                      |
| Why not merged here      | Java/market spine + compose Mongo; Denon spine hold; thrift vs order-route money PR |
| Done when                | rebased on tip, boots with evidence, or Denon supersedes                            |

---

## Dual-book residual (DB-1 honesty)

Layers enforced:

1. DAO mutators no-op + Java money scan
2. Spring `DualBookMoneyDoorInterceptor` (HTTP)
3. Service entry throws (legal wallet, withdraw, sign-in, matchWallet)
4. Promotion reward mints short-circuited

**Residual:** unreachable dead-code `setBalance` lines inside `if (null)` / commented paths; non-merged seeder; full JVM 410 smoke not in CI.

**ADR:** dual-book Accepted on main with DIRECTION #272 era.

---

## WAVE-AUDIT (SC-5)

Money ships in this program pack (order-route #289 slices):

- Chaos F1–F8 + properties + reconcile
- Dual-book door + scans + service disable
- Seed flag + volume honesty + make-only

Archive this file as the WAVE-AUDIT for the order-route harden wave. Next WAVE-AUDIT after next 3–4 product money ships.

---

## Autonomous finish prompt (enhanced — paste next session)

```
Program: order-route Spec v1 + Plan. Scoreboard: docs/ORDER-ROUTE-READINESS-SCOREBOARD.md.
Finish gate: docs/ORDER-ROUTE-PROGRAM-FINISH-2026-07-31.md.
Autonomous: no Nitro choices; worktree → implement → verify → PR; only stop for Human X.
Closed REQs: do not re-open. Residuals: only seeder boot, full fleet CX-8, dead setBalance, Human X.
If queue empty: re-derive Spec REQ matrix from tip; if all green/residual-named → report finished.
No go-live. No futures engine invent. Denon carve-out on posture merges.
```

---

## Nitro one-screen

|                                         |                                                                                          |
| --------------------------------------- | ---------------------------------------------------------------------------------------- |
| **Agent-finished?**                     | Yes when #289 CI green + this finish gate on tip                                         |
| **Your only remaining program choices** | Human X (secrets, go-live, prod RPC, kill drill) · Denon merge carve-out on dual-book PR |
| **Not your homework**                   | git, verify, residual seeder eng (agents/Denon spine)                                    |
