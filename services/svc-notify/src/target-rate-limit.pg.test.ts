import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { assertTestDatabase, postgresAvailable } from '@intafaced/db';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PostgresTargetRateLimiter } from './target-rate-limit.js';

/**
 * Shared register/verify rate budget — two "processes" (two limiter instances
 * on the same table) cannot both take past max.
 *
 * Until this suite, the multi-replica residual was only prose: each process
 * held its own counters. The Done bar for that residual is this test against
 * real Postgres, not a memory double that always agrees with itself.
 */

const URL = process.env.TEST_DATABASE_URL_NOTIFY ?? 'postgres://svc_notify:svc_notify@localhost:5433/intafaced_test';
const here = dirname(fileURLToPath(import.meta.url));

const MIGRATIONS = [
  '0000_notify_init.sql',
  '0001_notify_channels.sql',
  '0002_notify_delivery_accepted.sql',
  '0003_notify_mute_prefs.sql',
  '0004_notify_delivery_claim_lease.sql',
  '0005_notify_target_rate_windows.sql',
].map((f) => readFileSync(join(here, '..', 'drizzle', f), 'utf8'));

const available = await postgresAvailable(URL);
const sql = available ? postgres(URL, { max: 4, onnotice: () => undefined }) : null;

if (available && sql) {
  await assertTestDatabase(sql, 'svc-notify target-rate-limit.pg.test');
  for (const migration of MIGRATIONS) {
    await sql.unsafe(migration).catch(() => undefined);
  }
}

afterAll(async () => {
  await sql?.end({ timeout: 1 }).catch(() => undefined);
});

describe.skipIf(!available)('PostgresTargetRateLimiter — shared budget, executed', () => {
  beforeEach(async () => {
    await sql!`DELETE FROM notify.target_rate_windows`;
  });

  it('two limiters sharing the table cannot both take past max', async () => {
    // Two instances = two processes. max=1: first take wins; second must refuse.
    const a = new PostgresTargetRateLimiter(sql!, {
      register: { max: 1, windowMs: 60_000 },
      verify: { max: 1, windowMs: 60_000 },
    });
    const b = new PostgresTargetRateLimiter(sql!, {
      register: { max: 1, windowMs: 60_000 },
      verify: { max: 1, windowMs: 60_000 },
    });

    expect(await a.tryTake('user-a', 'sms', 'register')).toBe(true);
    expect(await b.tryTake('user-a', 'sms', 'register')).toBe(false);
    // Same process also refused — budget is global, not "first replica only".
    expect(await a.tryTake('user-a', 'sms', 'register')).toBe(false);
    // Other user / channel / op stay independent.
    expect(await b.tryTake('user-b', 'sms', 'register')).toBe(true);
    expect(await b.tryTake('user-a', 'email', 'register')).toBe(true);
    expect(await b.tryTake('user-a', 'sms', 'verify')).toBe(true);
  });

  it('concurrent takes on the last slot yield exactly one winner', async () => {
    const a = new PostgresTargetRateLimiter(sql!, {
      register: { max: 2, windowMs: 60_000 },
      verify: { max: 2, windowMs: 60_000 },
    });
    const b = new PostgresTargetRateLimiter(sql!, {
      register: { max: 2, windowMs: 60_000 },
      verify: { max: 2, windowMs: 60_000 },
    });

    // Spend one of two.
    expect(await a.tryTake('race-user', 'push', 'register')).toBe(true);

    // Race the last slot from both "processes".
    const [r1, r2] = await Promise.all([a.tryTake('race-user', 'push', 'register'), b.tryTake('race-user', 'push', 'register')]);
    const winners = [r1, r2].filter(Boolean).length;
    expect(winners).toBe(1);
    expect(await a.tryTake('race-user', 'push', 'register')).toBe(false);
  });
});
