/**
 * Unit card — the alert sweep is MOUNTED, not merely defined
 * 1. Promise: D-S-13 done bar item 7 — "wired means mounted, not defined". A
 *    watch surface that claims evaluation must have a caller in the entrypoint
 * 2. Break: someone deletes the sweep interval from index.ts, or injects a live
 *    mark source while nothing drives evaluation, and the alert API goes back to
 *    returning `status: 'active'` for watches nothing will ever look at
 * 3. Done bar: index.ts calls evaluateDueAlerts inside an interval and clears it
 *    on shutdown; the router discloses evaluation with the watchlist
 * 4. Class N
 * 5. Paths: svc-notify
 * 6. RED: delete the `alertSweep` interval, or the `evaluation` field on
 *    `notify.alerts`
 * 7. Collision: none (read-only source pin)
 *
 * WHY A SOURCE SCAN AND NOT A UNIT TEST. `index.ts` connects to Postgres and
 * NATS at module scope, so it cannot be imported by a unit test. The failure this
 * pins is exactly the one D-S-13's second correction records — a subscriber
 * defined in a file nothing imports, green in its own unit test, never run — and
 * the only check that catches it is one that reads the entrypoint. `svc-notify`
 * has now shipped that shape twice: a complete `bankMarginCalled` consumer that
 * parked, and a complete `evaluateMarket` with no caller.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel: string) => readFileSync(join(here, '..', rel), 'utf8');

describe('the alert evaluation driver is reachable from the entrypoint', () => {
  it('index.ts drives evaluateDueAlerts on an interval', () => {
    const index = src('index.ts');
    expect(index).toMatch(/evaluateDueAlerts\(/);
    // An interval, not a single pass at boot: a watch created after boot must be
    // evaluated too.
    expect(index).toMatch(/setInterval\([\s\S]*evaluateDueAlerts/);
    expect(index).toMatch(/ALERT_SWEEP_INTERVAL_MS/);
  });

  it('index.ts clears the sweep on shutdown, so a restart does not stack drivers', () => {
    expect(src('index.ts')).toMatch(/clearInterval\(alertSweep\)/);
  });

  it('/ready reports when the sweep last completed — a null lastAt means it never ran', () => {
    const index = src('index.ts');
    expect(index).toMatch(/lastAlertSweepAt/);
    expect(index).toMatch(/sweep: \{ lastAt/);
  });

  it('the router discloses evaluation status with the watchlist, not behind its own procedure', () => {
    const router = src('router.ts');
    expect(router).toMatch(/evaluationStatus\(\)/);
    expect(router).toMatch(/alertEvaluationOutput/);
    // Both surfaces: reading the list AND creating a watch.
    const createAlert = router.slice(router.indexOf('createAlert:'), router.indexOf('cancelAlert:'));
    expect(createAlert).toMatch(/evaluation: alerts\.evaluationStatus\(\)/);
  });

  it('live is only claimed by the trade HTTP factory when TRADE_URL is set — never hardcoded in the entrypoint', () => {
    // Inverse of the D-S-13 second correction: do not paint `kind: 'live'` on
    // the entrypoint to look finished. Dark remains the default when TRADE_URL
    // is unset. Live comes only from createTradeHttpMarkSource (public ticker
    // bank already uses) — not Class X credentials, and not invent.
    const index = src('index.ts');
    expect(index).toMatch(/kind: 'dark'/);
    expect(index).toMatch(/createTradeHttpMarkSource/);
    expect(index).toMatch(/env\.TRADE_URL/);
    // Entrypoint must not hardcode a live claim; only the factory may.
    expect(index).not.toMatch(/kind:\s*'live'/);
    const factory = src('alerts/trade-http-mark.ts');
    expect(factory).toMatch(/kind:\s*'live'/);
    expect(factory).toMatch(/\/api\/v1\/ticker\//);
  });

  it('evaluateMarket accepts the mark before firing — dark wiring cannot invent live', () => {
    const service = src('alerts/service.ts');
    expect(service).toMatch(/acceptAlertMark\(/);
    expect(service).toMatch(/outOfAppRequiredRefusal\(/);
  });

  it('accepted-mark refuses a live ok quote whose timestamp is older than the bank marking window', () => {
    // Inverse of "dark cannot invent live": a live source with a 2023 ticker
    // timestamp must not fire. Age law lives in accepted-mark (gate) and the
    // HTTP producer calls the same helper — deleting either is a hole.
    const accepted = src('alerts/accepted-mark.ts');
    expect(accepted).toMatch(/ALERT_MARK_MAX_AGE_MS\s*=\s*300_000/);
    expect(accepted).toMatch(/refuseIfMarkAged\(/);
    expect(src('alerts/service.ts')).toMatch(/acceptAlertMark\(this\.marks, raw, at\)/);
    expect(src('alerts/trade-http-mark.ts')).toMatch(/refuseIfMarkAged\(/);
  });
});
