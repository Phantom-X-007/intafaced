import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { createTestDb, postgresAvailable, rewriteSchemaSql, type TestDb } from '@intafaced/db';

/**
 * THE IDEMPOTENCY KEY MUST BE A KEY IN THE DATABASE, NOT ONLY IN TYPESCRIPT.
 *
 * `assertValidPost` has required 8 characters since 0000. The column had a UNIQUE
 * index and no length constraint, so raw SQL could write `''`.
 *
 * Why that is a money bug and not untidiness: the key is the IDENTITY of a
 * movement. `post()` returns the existing transaction for a key it has already
 * seen — and after #1060 it does so before validating the body, deliberately, so
 * the key is the only thing separating two different movements. A row holding the
 * empty key means the next caller whose key normalises to empty is handed that
 * transaction and told its own money movement succeeded. Nothing moved, and no
 * error is raised anywhere, because from the ledger's point of view a retry was
 * correctly deduplicated.
 *
 * The test inserts with raw SQL and ledger-client out of the picture, which is the
 * only version of the claim that means anything: the point is precisely that the
 * TypeScript path is not the only insert path. Same shape as #1044's asset-registry
 * test and #1050/#1058's purposed-lock test.
 */

const URL = process.env.TEST_DATABASE_URL ?? 'postgres://intafaced_ops:intafaced_ops@localhost:5433/intafaced_test';
const here = dirname(fileURLToPath(import.meta.url));
const drizzleDir = join(here, '..', '..', 'drizzle');

const migrations = readdirSync(drizzleDir)
  .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
  .sort()
  .map((f) => readFileSync(join(drizzleDir, f), 'utf8'))
  .map((body) => (schema: string) => rewriteSchemaSql(body, 'ledger', schema));

const CHECK_VIOLATION = '23514';
const available = await postgresAvailable(URL);

if (!available) {
  describe.skip('svc-ledger idempotency key backstop (Postgres unavailable)', () => {
    it('skipped', () => undefined);
  });
} else {
  describe('ledger_tx_idempotency_key_len_ck — the key is a key in the database', () => {
    let db: TestDb;

    beforeAll(async () => {
      db = await createTestDb({ service: 'ledger_idemkey', url: URL, migrations });
    });
    afterAll(async () => {
      await db?.drop();
    });

    const insert = (key: string) => db.sql`
      INSERT INTO ledger_tx (idempotency_key, module, reason, hash)
      VALUES (${key}, 'test', 'raw sql, no ledger-client', ${'h' + key})
    `;

    it.each(['', 'x', 'short', '1234567'])('REFUSES a %o key via raw SQL', async (key) => {
      await expect(insert(key)).rejects.toMatchObject({ code: CHECK_VIOLATION });
    });

    it('accepts the shortest key assertValidPost allows, so the two agree exactly', async () => {
      // 8 characters. If the constraint were stricter than the TypeScript rule the
      // two paths would disagree in the other direction, which is the divergence
      // #1060 was about.
      await expect(insert('12345678')).resolves.toBeDefined();
    });

    it('and the empty key cannot be squatted, which is the actual failure', async () => {
      // The concrete sequence this prevents: a raw insert claims '', then a caller
      // arrives with a key that normalises to '' and is handed the squatter's
      // transaction as if its own post had succeeded.
      await expect(insert('')).rejects.toMatchObject({ code: CHECK_VIOLATION });

      const rows = await db.sql<Array<{ n: string }>>`SELECT count(*) AS n FROM ledger_tx WHERE idempotency_key = ''`;
      expect(Number(rows[0]!.n)).toBe(0);
    });
  });
}
