import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, afterAll } from 'vitest';
import { createTestDb, postgresAvailable, rewriteSchemaSql, type TestDb } from '@intafaced/db';
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
 * Requires Postgres on localhost:5433 (`docker compose up -d`). Skips cleanly
 * when unreachable, rather than failing a laptop with no docker.
 */

const URL = process.env.TEST_DATABASE_URL ?? 'postgres://intafaced_ops:intafaced_ops@localhost:5433/intafaced_test';
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

const available = await postgresAvailable(URL);

if (!available) {
  describe.skip('svc-indexer · Postgres (unavailable — start docker compose)', () => {
    it('skipped', () => undefined);
  });
} else {
  const db: TestDb = await createTestDb({
    service: 'indexer',
    url: URL,
    migrations: migrations.map((body) => (schema: string) => rewriteSchemaSql(body, 'indexer', schema)),
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
    afterAll(async () => {
      await db.drop();
    });

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
}
