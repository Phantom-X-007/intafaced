import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { createTestDb, postgresAvailable, rewriteSchemaSql, type TestDb } from '@intafaced/db';

/**
 * LOCK POTS MUST NAME THEIR CLAIM IN THE DATABASE (STOP §4.2b #1).
 *
 * `assertPurposedLocks` already refuses unpurposed hold/escrow/stake/collateral
 * on the TypeScript path. Only `hold` had a CHECK. An unpurposed collateral
 * insert via raw SQL is the worst case (accounts.ts): releasing loan A could
 * unsecure loan B while every posting balances.
 *
 * Asserts raw-SQL refusal with ledger-client out of the picture.
 */

const URL = process.env.TEST_DATABASE_URL ?? 'postgres://intafaced_ops:intafaced_ops@localhost:5433/intafaced_test';
const here = dirname(fileURLToPath(import.meta.url));
const drizzleDir = join(here, '..', '..', 'drizzle');

const allMigrationFiles = readdirSync(drizzleDir)
  .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
  .sort();

const read = (f: string) => readFileSync(join(drizzleDir, f), 'utf8');
const allMigrations = allMigrationFiles.map((f) => (schema: string) => rewriteSchemaSql(read(f), 'ledger', schema));

const USER = '0007e7f3-2e25-4dc9-88b4-146db6d491f0';
const CHECK_VIOLATION = '23514';

const available = await postgresAvailable(URL);

if (!available) {
  describe.skip('svc-ledger purposed lock kinds (Postgres unavailable)', () => {
    it('skipped', () => undefined);
  });
} else {
  describe('accounts_lock_purposed_ck — database backstop for all lock kinds', () => {
    let db: TestDb;

    beforeAll(async () => {
      db = await createTestDb({ service: 'ledger_purposed', url: URL, migrations: allMigrations });
    });
    afterAll(async () => {
      await db?.drop();
    });

    it('still allows available with empty purpose', async () => {
      await expect(
        db.sql`
          INSERT INTO accounts (owner_type, owner_id, asset_id, kind, purpose)
          VALUES ('user'::owner_type, ${USER}, 'USDT', 'available'::account_kind, '')
        `,
      ).resolves.toBeDefined();
    });

    it.each(['hold', 'escrow', 'stake', 'collateral'] as const)('REFUSES unpurposed %s via raw SQL (no ledger-client)', async (kind) => {
      await expect(
        db.sql`
            INSERT INTO accounts (owner_type, owner_id, asset_id, kind, purpose)
            VALUES ('user'::owner_type, ${USER}, 'USDT', ${kind}::account_kind, '')
          `,
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });
    });

    it('allows purposed collateral', async () => {
      await expect(
        db.sql`
          INSERT INTO accounts (owner_type, owner_id, asset_id, kind, purpose)
          VALUES ('user'::owner_type, ${USER}, 'USDT', 'collateral'::account_kind, 'loan:probe-1')
        `,
      ).resolves.toBeDefined();
    });
  });
}
