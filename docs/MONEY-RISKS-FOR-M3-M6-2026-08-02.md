# Three money risks inside M3 and M6 — for @shehzad002

**From an evidence-based audit run 2026-08-02 against `261b45a`.** All three are in your mountains, so they are yours to fix or to decline — I have deliberately not touched `services/svc-trade` or `services/svc-bank`.

**All three are blocked on CODE only.** No licence, no bank, no oracle, no chain. That is unusual on this platform and it is why they are worth doing ahead of new surface.

**None is exploitable today.** Each is prevented by a coincidence of current data or configuration rather than by a gate — which is exactly the property that makes them worth fixing before the coincidence changes.

---

## 1 · A futures position can be opened while liquidation is switched off

**M3.**

`TRADE_FUTURES_JOBS_ENABLED` defaults **false** (`services/svc-trade/src/env.ts:63`), so the liquidation and funding jobs never run. **There is no corresponding flag on opening a position** — `POST /api/v1/positions` (`private-rest.ts:630`) has no gate at all.

What saves us today is data, not code: all 16 listed markets are `kind='spot'`, and the `positions` table is not even migrated on the running fleet.

**The moment anyone lists a perp market**, a position becomes openable, fundable through real ledger margin recipes, and **unliquidatable until an operator sets an environment variable**. Nothing in the code would object.

**Suggested shape:** opening a position should require the same switch that runs the jobs which protect it. A risk engine that can take a position it cannot close is the wrong way round, and the fix is a gate rather than a policy.

---

## 2 · A loan accrues nothing and is never liquidated

**M6.**

`svc-bank` exposes five job endpoints (`index.ts:100,112,138,161,179`) and deliberately runs no in-process timer — a reasonable design. But **nothing in the repository calls them.** A repo-wide search returns only their own definitions plus a negative edge-routing test. There is no cron in `docker-compose.apps.yml`. And `LOAN_RISK_SWEEP_ENABLED` defaults **false** (`env.ts:106`).

So a borrower can draw principal and it sits forever: no interest accrues, no margin call fires, no liquidation happens.

**The loan implementation itself is excellent** — purposed collateral, event-sourced debt, per-(loan, day) idempotency enforced in the migration, a tiered liquidation ladder. All verified. **It is inert, not wrong.** The gap is that nobody schedules it.

---

## 3 · Margin calls are recorded as delivered, and are not delivered

**M6, and this is the one I would fix first.**

The margin-call sink defaults to `recordOnlyMarginCallSink`, a no-op (`loan-service.ts:231,261`), and `index.ts` passes no sink. So `send()` succeeds trivially — and the code then stamps `notified_at = now()` (`loan-service.ts:1182`).

Two consequences, and the second is the serious one:

1. An operator querying `notified_at IS NOT NULL` concludes borrowers were warned. **Nobody was.**
2. **The grace clock that gates liquidation runs off that undelivered call.** So a borrower is liquidated after a warning period that began with a notification they never received.

A no-op sink is a fine default. **Stamping `notified_at` after a no-op is the defect** — the column should record delivery, not the attempt. `ops.notifications` already has the right posture to copy: `UnconfiguredChannel` **throws** `channel.not_configured` rather than returning a fake success.

---

## Context that may be useful

**Main is not red.** The money core is **1,805 tests passing, 0 failing, 0 skipped** after a clean install. If you see failures like `recipes.marketMakerSeedFund is not a function` or a `number`/`bigint` money error in `venue-contracts`, that is a stale build, not a bug: `pnpm install --frozen-lockfile && turbo run build` clears all of it.

**`svc-trade` is 403/403 serially** but deadlocks under default file parallelism against the shared test database. Live flakiness, not a code defect.

**The running fleet is ~228 commits behind main** and has applied only 2 of 7 `trade` migrations. Anything judged by clicking the local stack is judging July 30.

---

## Not yours, being handled

`custody-scan` reading Java, the vendored datastore exposure (#409), the `apps/web` landing page, and the `APP_ENV` compose default are all mine and outside M1–M7.

Ask if you want any of the three above reassigned — they are in your lane, but there is no rule that says you have to take them.
