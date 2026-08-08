import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { createTestDb, postgresAvailable, rewriteSchemaSql, type TestDb } from '@intafaced/db';
import { ACCOUNT_KINDS, ACCOUNT_KIND_CLASS, type AccountKind } from '@intafaced/ledger-client';

/**
 * EVERY LOCK NAMES ITS CLAIM, AND THE DATABASE IS WHAT SAYS SO (§8.1, P0-3).
 *
 * `assertPurposedLocks` has required a purpose on all four lock kinds for some
 * time. The database required it on `hold` alone — 0001's constraint, written
 * when that was the rule, never widened when the client moved. So the rule and
 * its backstop disagreed on `escrow`, `stake` and `collateral`, which is where
 * `accounts.ts` says the consequence is worst: "releasing loan A's collateral
 * could hand back value that was securing loan B: both postings balance, the
 * journal reconciles, and loan B is quietly unsecured."
 *
 * Two claims are asserted, neither provable from the client suite:
 *
 *   1. The CHECK refuses an unpurposed lock against a RAW INSERT, with
 *      `ledger-client` out of the picture — the README's argument for
 *      `owner_id` applying verbatim: an adapter bridging a Java stack will not
 *      route through a TypeScript library.
 *
 *   2. The CHECK and `ACCOUNT_KIND_CLASS` are the same rule in two languages, so
 *      every kind is put to both and the answers must match. A future edit to
 *      one that is not mirrored in the other fails here rather than in
 *      production — where it shows up either as the client accepting what the
 *      database rejects (a 500 on a money path), or, far worse, as both
 *      accepting because someone loosened them together.
 *
 * Requires Postgres. Skips cleanly when unreachable.
 */

const URL = process.env.TEST_DATABASE_URL ?? 'postgres://intafaced_ops:intafaced_ops@localhost:5433/intafaced_test';
const here = dirname(fileURLToPath(import.meta.url));
const drizzleDir = join(here, '..', '..', 'drizzle');

const allMigrationFiles = readdirSync(drizzleDir)
  .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
  .sort();

const PRIOR = allMigrationFiles.filter((f) => !f.startsWith('0007_'));
const UP = readFileSync(join(drizzleDir, '0007_lock_purposed.sql'), 'utf8');
const DOWN = readFileSync(join(drizzleDir, '0007_lock_purposed.down.sql'), 'utf8');

const read = (f: string) => readFileSync(join(drizzleDir, f), 'utf8');
const priorMigrations = PRIOR.map((f) => (schema: string) => rewriteSchemaSql(read(f), 'ledger', schema));
const allMigrations = allMigrationFiles.map((f) => (schema: string) => rewriteSchemaSql(read(f), 'ledger', schema));

const USER = '0007e7f3-2e25-4dc9-88b4-146db6d491f0';
const CHECK_VIOLATION = '23514';

const available = await postgresAvailable(URL);

if (!available) {
  describe.skip('svc-ledger lock purpose (Postgres unavailable — start docker compose)', () => {
    it('skipped', () => undefined);
  });
} else {
  // ───────────────────────────────────────────────────────────────────────────
  describe('accounts_lock_purposed_ck — enforced by the database, not by the caller', () => {
    let db: TestDb;

    beforeAll(async () => {
      db = await createTestDb({ service: 'ledger_lockpurpose', url: URL, migrations: allMigrations });
    });
    afterAll(async () => {
      await db?.drop();
    });

    const open = (kind: AccountKind, purpose: string) =>
      db.sql`
        INSERT INTO accounts (owner_type, owner_id, asset_id, kind, purpose)
        VALUES ('user'::owner_type, ${USER}, 'USDT', ${kind}::account_kind, ${purpose})
      `;

    it('REFUSES an unpurposed escrow, stake and collateral — the three 0001 left open', async () => {
      // This is the finding. Before 0007 all three of these succeeded, and each
      // one is a pot that cannot say whose claim it is holding.
      for (const kind of ['escrow', 'stake', 'collateral'] as const) {
        await expect(open(kind, ''), kind).rejects.toMatchObject({ code: CHECK_VIOLATION });
      }
    });

    it('still refuses an unpurposed hold — 0001 did not regress', async () => {
      await expect(open('hold', '')).rejects.toMatchObject({ code: CHECK_VIOLATION });
    });

    it('accepts every lock kind once it names its claim', async () => {
      for (const kind of ['hold', 'escrow', 'stake', 'collateral'] as const) {
        await expect(open(kind, `claim:${kind}`), kind).resolves.toBeDefined();
      }
    });

    it('leaves `available` fungible with itself — a purpose there fragments it for nothing', async () => {
      await expect(open('available', '')).resolves.toBeDefined();
    });

    it('refuses an UPDATE that empties an existing lock’s purpose', async () => {
      await open('escrow', 'trade:1');
      await expect(db.sql`UPDATE accounts SET purpose = '' WHERE purpose = 'trade:1'`).rejects.toMatchObject({
        code: CHECK_VIOLATION,
      });
    });

    /**
     * THE DRIFT GUARD.
     *
     * `ACCOUNT_KIND_CLASS` and the CHECK are one rule in two languages, and a
     * comment claiming they agree is not evidence. Every kind goes to both.
     */
    it('agrees with ACCOUNT_KIND_CLASS on every kind, in both directions', async () => {
      const disagreements: string[] = [];

      for (const kind of ACCOUNT_KINDS) {
        const clientAllowsBlank = ACCOUNT_KIND_CLASS[kind] === 'spendable';
        let databaseAllowsBlank: boolean;
        try {
          await db.sql`
            INSERT INTO accounts (owner_type, owner_id, asset_id, kind, purpose)
            VALUES ('user'::owner_type, ${USER}, 'BTC', ${kind}::account_kind, '')
          `;
          databaseAllowsBlank = true;
        } catch (err) {
          if ((err as { code?: string }).code !== CHECK_VIOLATION) throw err;
          databaseAllowsBlank = false;
        }
        if (clientAllowsBlank !== databaseAllowsBlank) {
          disagreements.push(`${kind}: client=${clientAllowsBlank} database=${databaseAllowsBlank}`);
        }
      }

      expect(disagreements).toEqual([]);
      await db.sql`DELETE FROM accounts WHERE asset_id = 'BTC'`;
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('migration 0007 on a table that already has rows', () => {
    let db: TestDb;

    beforeAll(async () => {
      db = await createTestDb({ service: 'ledger_lockmig', url: URL, migrations: priorMigrations });
    });
    afterAll(async () => {
      await db?.drop();
    });

    it('REFUSES, naming the pot, rather than stopping a deploy halfway', async () => {
      // Exactly the state the pre-0007 schema permitted: a collateral pot that
      // cannot say which loan it secures.
      await db.sql`
        INSERT INTO accounts (owner_type, owner_id, asset_id, kind, purpose)
        VALUES ('user'::owner_type, ${USER}, 'USDT', 'collateral'::account_kind, '')
      `;

      await expect(db.sql.unsafe(rewriteSchemaSql(UP, 'ledger', db.schema))).rejects.toMatchObject({
        message: expect.stringContaining('collateral'),
      });

      // And it left the pot alone — a migration does not move value (§0.6).
      const [row] = await db.sql<{ n: string }[]>`SELECT count(*)::text AS n FROM accounts WHERE kind = 'collateral'`;
      expect(row?.n).toBe('1');
    });

    it('applies once the pot is gone, and reverses to 0001’s narrower rule', async () => {
      await db.sql`DELETE FROM accounts WHERE kind = 'collateral'`;

      await db.sql.unsafe(rewriteSchemaSql(UP, 'ledger', db.schema));
      await expect(
        db.sql`
          INSERT INTO accounts (owner_type, owner_id, asset_id, kind, purpose)
          VALUES ('user'::owner_type, ${USER}, 'USDT', 'stake'::account_kind, '')
        `,
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });

      await db.sql.unsafe(rewriteSchemaSql(DOWN, 'ledger', db.schema));
      // 0001's rule is back: stake may go unpurposed again, hold may not.
      await expect(
        db.sql`
          INSERT INTO accounts (owner_type, owner_id, asset_id, kind, purpose)
          VALUES ('user'::owner_type, ${USER}, 'USDT', 'stake'::account_kind, '')
        `,
      ).resolves.toBeDefined();
      await expect(
        db.sql`
          INSERT INTO accounts (owner_type, owner_id, asset_id, kind, purpose)
          VALUES ('user'::owner_type, ${USER}, 'USDT', 'hold'::account_kind, '')
        `,
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });
    });
  });
}
