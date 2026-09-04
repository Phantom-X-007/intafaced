import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { createTestDb, rewriteSchemaSql, type TestDb } from '@intafaced/db';

/**
 * VALUE MAY NOT EXIST IN AN ASSET THE LEDGER HAS NEVER HEARD OF (§4.2).
 *
 * Three places said so and nothing enforced it. `0003` — "Every one of them
 * needs a row in `ledger.assets` before a balance in it can exist." `0004` — "a
 * market whose asset has no row here fails at the first ledger post rather than
 * at listing time." `packages/contracts/src/instruments.test.ts` — "the first
 * order fails at the ledger rather than at the listing."
 *
 * None of it was true. `asset_id` was bare `text` on both tables, with no
 * foreign key, no CHECK and no lookup, and no code in this service ever read
 * the `assets` table. A one-character typo opened a second complete book:
 * balanced per-asset, non-negative, hash-chained, reconciling — and unreachable,
 * because no rail or market or asset-keyed query would ever see it.
 *
 * Two claims are asserted here, and neither is provable from the client suite:
 *
 *   1. The keys refuse an unregistered asset against a RAW INSERT, with
 *      `ledger-client` entirely out of the picture. The README's own argument:
 *      "an adapter bridging a Java stack is the least likely caller in the OS to
 *      route through a TypeScript library, so application-only enforcement would
 *      be bypassable by exactly the thing it exists to stop."
 *
 *   2. Migration 0006 behaves correctly on a table that ALREADY HAS ROWS. A
 *      constraint added ahead of its data passes on an empty database and stops
 *      a deploy in the middle of a populated one. So the populated case is built
 *      explicitly: rows in an unregistered asset, then the migration, and its
 *      refusal is asserted — including that it names the offending asset.
 *
 * H8a PG-hard: this file never `describe.skip` / `postgresAvailable`. CI uses
 * TEST_DATABASE_URL (per-run schema via `createTestDb`). Local without that env
 * starts Testcontainers `postgres:16-alpine`. Docker/PG down is a failed suite,
 * not a green skip.
 */

const here = dirname(fileURLToPath(import.meta.url));
const drizzleDir = join(here, '..', '..', 'drizzle');

const allMigrationFiles = readdirSync(drizzleDir)
  .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
  .sort();

/** Everything before the one under test — the schema as production has it today. */
const PRIOR = allMigrationFiles.filter((f) => !f.startsWith('0006_'));
const UP = readFileSync(join(drizzleDir, '0006_asset_must_exist.sql'), 'utf8');
const DOWN = readFileSync(join(drizzleDir, '0006_asset_must_exist.down.sql'), 'utf8');

const read = (f: string) => readFileSync(join(drizzleDir, f), 'utf8');
const priorMigrations = PRIOR.map((f) => (schema: string) => rewriteSchemaSql(read(f), 'ledger', schema));
const allMigrations = allMigrationFiles.map((f) => (schema: string) => rewriteSchemaSql(read(f), 'ledger', schema));

const USER = '0007e7f3-2e25-4dc9-88b4-146db6d491f0';
const FOREIGN_KEY_VIOLATION = '23503';

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
      `H8a: svc-ledger asset-registry is PG-hard (no skip-green). ` +
        `TEST_DATABASE_URL unset and Testcontainers could not start ${H8A_IMAGE}: ${msg}`,
    );
  }
}

describe('svc-ledger asset-registry PG-hard (source)', () => {
  it('H8a money suite is not skip-green (no postgresAvailable / describe.skip)', () => {
    const src = readFileSync(fileURLToPath(import.meta.url), 'utf8');
    expect(src).not.toMatch(/\bpostgresAvailable\s*\(/);
    expect(src).not.toMatch(/describe\.skip\s*\(/);
    expect(src).not.toMatch(/\bit\.skip\s*\(/);
  });
});

describe('svc-ledger asset registry', () => {
  let adminStop: () => Promise<void> = async () => undefined;
  let adminUrl: string | undefined;

  beforeAll(async () => {
    const admin = await openH8aAdmin();
    adminStop = admin.stop;
    adminUrl = admin.url;
  }, 120_000);

  afterAll(async () => {
    await adminStop();
  }, 30_000);

  // ───────────────────────────────────────────────────────────────────────────
  describe('accounts_asset_id_fk — enforced by the database, not by the caller', () => {
    let db: TestDb | undefined;

    beforeAll(async () => {
      if (!adminUrl) throw new Error('H8a: test db not opened');
      db = await createTestDb({ service: 'ledger_assetreg', url: adminUrl, migrations: allMigrations });
    }, 120_000);
    afterAll(async () => {
      await db?.drop();
    }, 30_000);

    const openAccount = (assetId: string) => {
      if (!db) throw new Error('H8a: test db not opened');
      return db.sql`
        INSERT INTO accounts (owner_type, owner_id, asset_id, kind, purpose)
        VALUES ('user'::owner_type, ${USER}, ${assetId}, 'available'::account_kind, '')
      `;
    };

    it('REFUSES an account in an asset with no row in ledger.assets — raw SQL, no client library', async () => {
      // This is the finding. Before 0006 this INSERT succeeded, and everything
      // built on top of it balanced and reconciled while being unspendable.
      await expect(openAccount('USTD')).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
    });

    it('still allows every asset the seed migrations registered', async () => {
      for (const asset of ['USDT', 'BTC', 'IFC', 'XAU', 'EUR']) {
        await expect(openAccount(asset)).resolves.toBeDefined();
      }
    });

    it('refuses an UPDATE that moves an existing account into an unregistered asset', async () => {
      if (!db) throw new Error('H8a: test db not opened');
      await openAccount('ETH');
      await expect(db.sql`UPDATE accounts SET asset_id = 'ETHH' WHERE asset_id = 'ETH'`).rejects.toMatchObject({
        code: FOREIGN_KEY_VIOLATION,
      });
      await db.sql`DELETE FROM accounts WHERE asset_id = 'ETH'`;
    });

    it('refuses an entry in an unregistered asset, even pointing at a valid account', async () => {
      if (!db) throw new Error('H8a: test db not opened');
      // `ledger_entries.asset_id` is denormalised from the account but written
      // independently, so it is constrained independently.
      const [account] = await db.sql<{ id: string }[]>`
        INSERT INTO accounts (owner_type, owner_id, asset_id, kind, purpose)
        VALUES ('user'::owner_type, ${USER}, 'USDC', 'available'::account_kind, '')
        RETURNING id
      `;
      const [tx] = await db.sql<{ id: string }[]>`
        INSERT INTO ledger_tx (module, reason, idempotency_key, hash)
        VALUES ('ledger', 'asset-fk-probe', ${`asset-fk-${USER}`}, 'not-a-real-chain-hash')
        RETURNING id
      `;
      await expect(
        db.sql`
          INSERT INTO ledger_entries (tx_id, account_id, asset_id, direction, amount, balance_after)
          VALUES (${tx!.id}, ${account!.id}, 'USDCC', 'credit'::direction, 1, 1)
        `,
      ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
    });

    it('refuses deleting an asset that still holds balances — RESTRICT, not silent orphaning', async () => {
      if (!db) throw new Error('H8a: test db not opened');
      await openAccount('AUD');
      await expect(db.sql`DELETE FROM assets WHERE id = 'AUD'`).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
      await db.sql`DELETE FROM accounts WHERE asset_id = 'AUD'`;
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('migration 0006 on a table that already has rows', () => {
    let db: TestDb | undefined;

    beforeAll(async () => {
      if (!adminUrl) throw new Error('H8a: test db not opened');
      db = await createTestDb({ service: 'ledger_assetmig', url: adminUrl, migrations: priorMigrations });
    }, 120_000);
    afterAll(async () => {
      await db?.drop();
    }, 30_000);

    it('REFUSES, naming the asset, rather than stopping a deploy halfway', async () => {
      if (!db) throw new Error('H8a: test db not opened');
      // Exactly the state the pre-0006 schema permitted: a phantom book.
      await db.sql`
        INSERT INTO accounts (owner_type, owner_id, asset_id, kind, purpose)
        VALUES ('user'::owner_type, ${USER}, 'USTD', 'available'::account_kind, '')
      `;

      await expect(db.sql.unsafe(rewriteSchemaSql(UP, 'ledger', db.schema))).rejects.toMatchObject({
        message: expect.stringContaining('USTD'),
      });

      // And it left the row alone — a migration does not move value (§0.6).
      const [row] = await db.sql<{ n: string }[]>`SELECT count(*)::text AS n FROM accounts WHERE asset_id = 'USTD'`;
      expect(row?.n).toBe('1');
    });

    it('applies cleanly once the phantom book is gone, and reverses', async () => {
      if (!db) throw new Error('H8a: test db not opened');
      await db.sql`DELETE FROM accounts WHERE asset_id = 'USTD'`;

      await db.sql.unsafe(rewriteSchemaSql(UP, 'ledger', db.schema));
      await expect(
        db.sql`
          INSERT INTO accounts (owner_type, owner_id, asset_id, kind, purpose)
          VALUES ('user'::owner_type, ${USER}, 'USTD', 'available'::account_kind, '')
        `,
      ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });

      // Down restores the old behaviour exactly — the door, re-opened.
      await db.sql.unsafe(rewriteSchemaSql(DOWN, 'ledger', db.schema));
      await expect(
        db.sql`
          INSERT INTO accounts (owner_type, owner_id, asset_id, kind, purpose)
          VALUES ('user'::owner_type, ${USER}, 'USTD', 'available'::account_kind, '')
        `,
      ).resolves.toBeDefined();
    });
  });
});
