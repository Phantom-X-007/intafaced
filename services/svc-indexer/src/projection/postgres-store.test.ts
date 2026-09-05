import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, rewriteSchemaSql, type TestDb } from '@intafaced/db';
import { PostgresProjectionStore } from './postgres-store.js';
import { CHAIN_ID, runProjectionConformance } from '../testing/conformance.js';

/**
 * The Postgres store runs the SAME conformance suite as the in-memory
 * reference. If the two disagree, one of them is wrong and the suite decides.
 *
 * That matters most for the reorg section. `unwindTo` is a DELETE and
 * `prune` is a DELETE with a correlated subquery — the kind of SQL that looks
 * right and is off by one row, and the kind no amount of reading catches. The
 * memory store's version of both is short enough to check by eye, so running
 * them against the same assertions is the check.
 *
 * Isolation: every run gets its own Postgres schema via `createTestDb`, built
 * from this service's real migrations. Two worktrees can run this file at once.
 *
 * H8a PG-hard: this file never `describe.skip` / `postgresAvailable`. CI uses
 * TEST_DATABASE_URL (CREATEDB via `createTestDb`). Local without that env starts
 * Testcontainers `postgres:16-alpine`. Docker/PG down is a failed suite, not a
 * green skip. The admin URL is `TEST_DATABASE_URL`, not a per-service role:
 * creating a schema needs CREATEDB, which those roles deliberately lack.
 */

const here = dirname(fileURLToPath(import.meta.url));
const drizzleDir = join(here, '..', '..', 'drizzle');

/**
 * Every forward migration, in order — read from disk rather than listed here.
 * A hardcoded filename means the test schema silently drifts from the real one
 * the first time someone adds a migration.
 */
const migrationFiles = readdirSync(drizzleDir)
  .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
  .sort();

if (migrationFiles.length === 0) throw new Error(`No migrations found in ${drizzleDir}`);

const migrations = migrationFiles.map((f) => readFileSync(join(drizzleDir, f), 'utf8'));
const downFiles = migrationFiles.map((f) => readFileSync(join(drizzleDir, f.replace(/\.sql$/, '.down.sql')), 'utf8'));

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
      `H8a: svc-indexer postgres-store is PG-hard (no skip-green). ` +
        `TEST_DATABASE_URL unset and Testcontainers could not start ${H8A_IMAGE}: ${msg}`,
    );
  }
}

describe('svc-indexer postgres-store PG-hard (source)', () => {
  it('H8a money suite is not skip-green (no postgresAvailable / describe.skip)', () => {
    const src = readFileSync(fileURLToPath(import.meta.url), 'utf8');
    expect(src).not.toMatch(/\bpostgresAvailable\s*\(/);
    expect(src).not.toMatch(/describe\.skip\s*\(/);
    expect(src).not.toMatch(/\bit\.skip\s*\(/);
  });
});

describe('svc-indexer · PostgresProjectionStore PG-hard', () => {
  let adminStop: () => Promise<void> = async () => undefined;
  let db!: TestDb;

  beforeAll(async () => {
    const admin = await openH8aAdmin();
    adminStop = admin.stop;
    db = await createTestDb({
      service: 'indexer',
      url: admin.url,
      migrations: migrations.map((body) => (schema: string) => rewriteSchemaSql(body, 'indexer', schema)),
    });
  }, 120_000);

  afterAll(async () => {
    await db?.drop();
    await adminStop();
  });

  runProjectionConformance('PostgresProjectionStore', async () => {
    const store = new PostgresProjectionStore(db.sql, CHAIN_ID);
    return {
      store,
      reset: async () => {
        await db.sql`TRUNCATE positions, fills, book_levels, blocks RESTART IDENTITY CASCADE`;
      },
    };
  });

  describe('svc-indexer · database-level guarantees', () => {
    /**
     * The invariant the code does not have to be trusted with.
     *
     * Two canonical blocks at one height means two answers to every read below
     * it. A bug that produces one is otherwise invisible until a user sees the
     * wrong price, so the partial unique index makes the state unrepresentable
     * — and this asserts the index exists rather than assuming the migration
     * ran the way it reads.
     */
    it('refuses two canonical blocks at the same height', async () => {
      await db.sql`TRUNCATE positions, fills, book_levels, blocks RESTART IDENTITY CASCADE`;
      const insert = (hash: string) => db.sql`
        INSERT INTO blocks (chain_id, hash, parent_hash, height, status, block_time)
        VALUES (${CHAIN_ID}, ${hash}, ${`0x${'0'.repeat(64)}`}, 7, 'canonical', now())
      `;
      await insert(`0x${'a'.repeat(64)}`);
      await expect(insert(`0x${'b'.repeat(64)}`)).rejects.toMatchObject({ code: '23505' });

      // …but an ORPHANED block may share the height. That is the whole point of
      // keeping the loser: a partial index that also covered orphans would make
      // the forensic record impossible to write.
      await expect(db.sql`
        INSERT INTO blocks (chain_id, hash, parent_hash, height, status, block_time)
        VALUES (${CHAIN_ID}, ${`0x${'c'.repeat(64)}`}, ${`0x${'0'.repeat(64)}`}, 7, 'orphaned', now())
      `).resolves.toBeDefined();
    });

    it('stores money as numeric, not as a float', async () => {
      const [row] = await db.sql<Array<{ data_type: string; numeric_precision: number; numeric_scale: number }>>`
        SELECT data_type, numeric_precision, numeric_scale
        FROM information_schema.columns
        WHERE table_schema = ${db.schema} AND table_name = 'book_levels' AND column_name = 'quantity'
      `;
      expect(row).toMatchObject({ data_type: 'numeric', numeric_precision: 38, numeric_scale: 18 });
    });

    /**
     * Parent-link / height-gap parity with MemoryProjectionStore (memory #1420).
     * The store is the last line of defence if a second writer or corrupt apply
     * tries to plant an unlinked height.
     */
    it('refuses parent mismatch and height gaps without moving head', async () => {
      await db.sql`TRUNCATE positions, fills, book_levels, blocks RESTART IDENTITY CASCADE`;
      const store = new PostgresProjectionStore(db.sql, CHAIN_ID);
      const H0 = `0x${'11'.repeat(32)}`;
      const H1 = `0x${'22'.repeat(32)}`;
      const H2 = `0x${'33'.repeat(32)}`;
      const BAD = `0x${'44'.repeat(32)}`;
      const blk = (height: number, hash: string, parentHash: string) => ({
        chainId: CHAIN_ID,
        height,
        hash,
        parentHash,
        timestamp: 1_700_000_000 + height,
        events: [] as const,
      });

      await store.applyBlock(blk(0, H0, `0x${'00'.repeat(32)}`));
      await store.applyBlock(blk(1, H1, H0));

      await expect(store.applyBlock(blk(2, H2, BAD))).rejects.toThrow(/parent_mismatch|parent_missing/);
      expect((await store.head())?.hash).toBe(H1);

      await expect(store.applyBlock(blk(3, H2, H1))).rejects.toThrow(/height_gap/);
      expect((await store.head())?.height).toBe(1);

      await store.applyBlock(blk(2, H2, H1));
      expect((await store.head())?.hash).toBe(H2);
    });

    it('refuses planting a height below the current tip', async () => {
      await db.sql`TRUNCATE positions, fills, book_levels, blocks RESTART IDENTITY CASCADE`;
      const store = new PostgresProjectionStore(db.sql, CHAIN_ID);
      const H0 = `0x${'11'.repeat(32)}`;
      const H1 = `0x${'22'.repeat(32)}`;
      const H2 = `0x${'33'.repeat(32)}`;
      const blk = (height: number, hash: string, parentHash: string) => ({
        chainId: CHAIN_ID,
        height,
        hash,
        parentHash,
        timestamp: 1_700_000_000 + height,
        events: [] as const,
      });

      // Cold start at height 5 — under-tip empty is normal after startHeight.
      await store.applyBlock(blk(5, H0, `0x${'00'.repeat(32)}`));
      await store.applyBlock(blk(6, H1, H0));

      await expect(store.applyBlock(blk(0, H2, `0x${'00'.repeat(32)}`))).rejects.toThrow(/height_below_tip/);
      expect((await store.head())?.hash).toBe(H1);
      expect(await store.blockAt(0)).toBeNull();
    });

    /**
     * Reversibility, proven rather than claimed (§14 DoD).
     *
     * Applies every `.down.sql` in reverse, asserts the tables are gone, then
     * re-applies the forward migrations and asserts they are back. A reversal
     * that has never been executed is a file, not a rollback plan.
     */
    it('reverses and re-applies every migration', async () => {
      const tableNames = async () =>
        (
          await db.sql<Array<{ table_name: string }>>`
            SELECT table_name FROM information_schema.tables WHERE table_schema = ${db.schema} ORDER BY table_name
          `
        ).map((r) => r.table_name);

      const before = await tableNames();
      expect(before).toEqual(['blocks', 'book_levels', 'fills', 'positions']);

      for (const body of [...downFiles].reverse()) {
        await db.sql.unsafe(rewriteSchemaSql(body, 'indexer', db.schema));
      }
      expect(await tableNames()).toEqual([]);

      for (const body of migrations) {
        await db.sql.unsafe(rewriteSchemaSql(body, 'indexer', db.schema));
      }
      expect(await tableNames()).toEqual(before);
    });
  });
});
