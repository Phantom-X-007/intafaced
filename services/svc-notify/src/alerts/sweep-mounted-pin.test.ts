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

  it('no mark source in production claims to be live — that is a Class X credential decision, not a code change', () => {
    // The inverse of the D-S-13 second correction: there, a gate went green
    // because handlers existed. Here the risk is the opposite direction — a
    // future edit flipping `kind` to 'live' to make a surface look finished while
    // no feed is actually wired. The dark port is the honest default and stays
    // until an owner provisions a real one.
    const index = src('index.ts');
    expect(index).toMatch(/kind: 'dark'/);
    expect(index).not.toMatch(/kind: 'live'/);
  });
});
