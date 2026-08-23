/**
 * Two postgres.js clients, one key — the replica-safety the fake SQL suite
 * cannot prove. INSERT ON CONFLICT is the lock; two processes cannot both
 * `mine`, and runDurableBroadcast therefore signs once.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { createTestDatabase, postgresAvailable, type TestDatabase } from '@intafaced/db';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PostgresBroadcastStore } from './broadcast-store.js';
import { runDurableBroadcast } from './durable-broadcast.js';

const URL = process.env.TEST_DATABASE_URL ?? 'postgres://intafaced_ops:intafaced_ops@localhost:5433/intafaced_test';
const here = dirname(fileURLToPath(import.meta.url));
const drizzle = join(here, '..', '..', 'drizzle');
const migrations = readdirSync(drizzle)
  .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
  .sort()
  .map((f) => readFileSync(join(drizzle, f), 'utf8'));

const available = await postgresAvailable(URL);

if (!available) {
  describe.skip('PostgresBroadcastStore two-process (Postgres unavailable — start docker compose)', () => {
    it('skipped', () => undefined);
  });
} else {
  const db: TestDatabase = await createTestDatabase({ service: 'pay', url: URL, migrations });
  const sqlA = db.sql;
  const sqlB = postgres(db.url, {
    max: 4,
    connection: { search_path: 'pay,public', application_name: `${db.database}-b` },
    onnotice: () => undefined,
  });
  const opts = { pollMs: 10, maxWaits: 80 } as const;

  beforeEach(async () => {
    await sqlA`TRUNCATE pay.crypto_broadcasts RESTART IDENTITY CASCADE`;
  });

  afterAll(async () => {
    await sqlB.end({ timeout: 0 }).catch(() => undefined);
    await db.drop();
  }, 30_000);

  describe('PostgresBroadcastStore — two connections cannot double-send', () => {
    it('exactly one concurrent claimer gets mine; the other converges on the same hash', async () => {
      const a = new PostgresBroadcastStore(sqlA, opts);
      const b = new PostgresBroadcastStore(sqlB, opts);
      const kinds: string[] = [];

      await Promise.all(
        [a, b].map((store) =>
          store.claim('payout:e13:db:1').then(async (claim) => {
            kinds.push(claim.kind);
            if (claim.kind === 'mine') {
              await store.putSigned('payout:e13:db:1', '0xraw');
              await store.put('payout:e13:db:1', '0xabc');
            } else if (claim.kind === 'resume') {
              expect(claim.signedRaw).toBe('0xraw');
              await store.put('payout:e13:db:1', '0xabc');
            } else {
              expect(claim.txHash).toBe('0xabc');
            }
          }),
        ),
      );

      expect(kinds.filter((k) => k === 'mine')).toHaveLength(1);
      expect(kinds.filter((k) => k === 'done' || k === 'resume')).toHaveLength(1);
      expect(await a.get('payout:e13:db:1')).toBe('0xabc');
      expect(await b.get('payout:e13:db:1')).toBe('0xabc');
    });

    it('fail-first: two identical keys → sign once, one hash', async () => {
      const a = new PostgresBroadcastStore(sqlA, opts);
      const b = new PostgresBroadcastStore(sqlB, opts);
      const sign = vi.fn(async () => '0xraw-once');
      const broadcast = vi.fn(async (raw: string) => {
        expect(raw).toBe('0xraw-once');
        return '0xhash-once';
      });

      const [ha, hb] = await Promise.all([
        runDurableBroadcast({ store: a, idempotencyKey: 'payout:e13:db:2', sign, broadcast }),
        runDurableBroadcast({ store: b, idempotencyKey: 'payout:e13:db:2', sign, broadcast }),
      ]);

      expect(ha).toBe('0xhash-once');
      expect(hb).toBe('0xhash-once');
      expect(sign).toHaveBeenCalledTimes(1);
      expect(new Set(broadcast.mock.calls.map((call) => call[0]))).toEqual(new Set(['0xraw-once']));
    });
  });
}
