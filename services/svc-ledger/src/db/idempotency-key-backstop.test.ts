import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { createTestDb, rewriteSchemaSql, type TestDb } from '@intafaced/db';

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
 *
 * H8a PG-hard: this file never `describe.skip` / `postgresAvailable`. CI uses
 * TEST_DATABASE_URL (per-run schema via `createTestDb`). Local without that env
 * starts Testcontainers `postgres:16-alpine`. Docker/PG down is a failed suite,
 * not a green skip.
 */

const here = dirname(fileURLToPath(import.meta.url));
const drizzleDir = join(here, '..', '..', 'drizzle');

const migrations = readdirSync(drizzleDir)
  .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
  .sort()
  .map((f) => readFileSync(join(drizzleDir, f), 'utf8'))
  .map((body) => (schema: string) => rewriteSchemaSql(body, 'ledger', schema));

const CHECK_VIOLATION = '23514';

const H8A_IMAGE = 'postgres:16-alpine';

async function openH8aAdmin(): Promise<{ url: string; stop: () => Promise<void> }> {
  const envUrl = process.env.TEST_DATABASE_URL?.trim();
  if (envUrl) {
    return { url: envUrl, stop: async () => undefined };
  }

  try {
    const container = await new PostgreSqlContainer(H8A_IMAGE)
      .withDatabase('intafaced_h8a_test')
      .withUsername('intafaced')
      .withPassword('intafaced')
      .start();
    return {
      url: container.getConnectionUri(),
      stop: async () => {
        await container.stop();
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `H8a: svc-ledger idempotency-key-backstop is PG-hard (no skip-green). ` +
        `TEST_DATABASE_URL unset and Testcontainers could not start ${H8A_IMAGE}: ${msg}`,
    );
  }
}

describe('svc-ledger idempotency-key-backstop PG-hard (source)', () => {
  it('H8a money suite is not skip-green (no postgresAvailable / describe.skip)', () => {
    const src = readFileSync(fileURLToPath(import.meta.url), 'utf8');
    expect(src).not.toMatch(/\bpostgresAvailable\s*\(/);
    expect(src).not.toMatch(/describe\.skip\s*\(/);
    expect(src).not.toMatch(/\bit\.skip\s*\(/);
  });
});

describe('ledger_tx_idempotency_key_len_ck — the key is a key in the database', () => {
  let adminStop: () => Promise<void> = async () => undefined;
  let db: TestDb | undefined;

  beforeAll(async () => {
    const admin = await openH8aAdmin();
    adminStop = admin.stop;
    db = await createTestDb({ service: 'ledger_idemkey', url: admin.url, migrations });
  }, 120_000);
  afterAll(async () => {
    await db?.drop();
    await adminStop();
  }, 30_000);

  const insert = (key: string) => {
    if (!db) throw new Error('H8a: test db not opened');
    return db.sql`
      INSERT INTO ledger_tx (idempotency_key, module, reason, hash)
      VALUES (${key}, 'test', 'raw sql, no ledger-client', ${'h' + key})
    `;
  };

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
    if (!db) throw new Error('H8a: test db not opened');
    await expect(insert('')).rejects.toMatchObject({ code: CHECK_VIOLATION });

    const rows = await db.sql<Array<{ n: string }>>`SELECT count(*) AS n FROM ledger_tx WHERE idempotency_key = ''`;
    expect(Number(rows[0]!.n)).toBe(0);
  });
});
