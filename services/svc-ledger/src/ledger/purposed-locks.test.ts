import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { createTestDb, postgresAvailable, rewriteSchemaSql, type TestDb } from '@intafaced/db';
import { ACCOUNT_KINDS } from '@intafaced/ledger-client';

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

    /**
     * DRIVEN OFF THE KIND LIST, NOT A COPY OF IT.
     *
     * 0007's CHECK enumerated the four locked kinds, and this test enumerated
     * the same four independently — so a fifth lock kind would have been added
     * to the enum, missed by the constraint, and missed by the test that exists
     * to guard the constraint. Both lists have to come from one place, and
     * `ACCOUNT_KINDS` in ledger-client is where kinds are declared.
     *
     * `available` is the single exemption: it reserves nothing, so it has
     * nothing to name. Everything else must justify itself in the database, and
     * a new kind is covered here the moment it joins the enum.
     */
    const LOCK_KINDS = ACCOUNT_KINDS.filter((k) => k !== 'available');

    it('covers every non-available kind the enum declares', () => {
      // Guards the guard: if `ACCOUNT_KINDS` were ever empty or mis-imported,
      // `it.each` below would silently assert nothing at all.
      expect(LOCK_KINDS.length).toBeGreaterThanOrEqual(4);
      expect(LOCK_KINDS).not.toContain('available');
    });

    it.each(LOCK_KINDS)('REFUSES unpurposed %s via raw SQL (no ledger-client)', async (kind) => {
      await expect(
        db.sql`
            INSERT INTO accounts (owner_type, owner_id, asset_id, kind, purpose)
            VALUES ('user'::owner_type, ${USER}, 'USDT', ${kind}::account_kind, '')
          `,
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });
    });

    /**
     * THE BACKFILL 0007 SHIPPED, AS A TEST.
     *
     * 0008 refuses a `legacy:<id>` purpose rather than accepting it, because a
     * purpose that names the row it is attached to answers nothing. Under 0007's
     * constraint this insert SUCCEEDED — the string is non-empty, so the CHECK
     * was satisfied by data it existed to catch.
     *
     * The migration cannot re-raise here (its refusal ran before this schema had
     * any rows), so the constraint has to carry the rule forward. Anything that
     * looks like the minted identity is refused on the way in.
     */
    it('REFUSES the legacy: stamp 0007 would have minted', async () => {
      await expect(
        db.sql`
          INSERT INTO accounts (owner_type, owner_id, asset_id, kind, purpose)
          VALUES ('user'::owner_type, ${USER}, 'USDT', 'collateral'::account_kind, ${'legacy:' + USER})
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

    it('REFUSES whitespace-only lock purpose via raw SQL (0011 btrim belt)', async () => {
      // Client trims and treats spaces as empty; 0008 length(purpose)>0 let
      // purpose '   ' land as a lock pot that names nothing.
      await expect(
        db.sql`
          INSERT INTO accounts (owner_type, owner_id, asset_id, kind, purpose)
          VALUES ('user'::owner_type, ${USER}, 'USDT', 'hold'::account_kind, '   ')
        `,
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });
    });

    it('REFUSES padded lock purpose — identity is the trimmed claim (P0-3)', async () => {
      await expect(
        db.sql`
          INSERT INTO accounts (owner_type, owner_id, asset_id, kind, purpose)
          VALUES ('user'::owner_type, ${USER}, 'USDT', 'hold'::account_kind, 'order:x ')
        `,
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });
    });

    /**
     * 0011 used bare `btrim(purpose)` — space only. Client `String.trim()` also
     * strips tab/CR/LF/NBSP. Raw SQL could open `order:x\t` beside `order:x`
     * while recon stayed green (P0-3 dual book). 0012 closes that belt.
     */
    it('REFUSES tab-padded lock purpose — not just space (0012 JS-trim belt)', async () => {
      await expect(
        db.sql`
          INSERT INTO accounts (owner_type, owner_id, asset_id, kind, purpose)
          VALUES ('user'::owner_type, ${USER}, 'USDT', 'hold'::account_kind, ${'order:x\t'})
        `,
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });
    });

    it('REFUSES tab-only lock purpose — names nothing after JS trim', async () => {
      await expect(
        db.sql`
          INSERT INTO accounts (owner_type, owner_id, asset_id, kind, purpose)
          VALUES ('user'::owner_type, ${USER}, 'USDT', 'hold'::account_kind, ${'\t\t\t'})
        `,
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });
    });

    it('REFUSES NBSP-padded lock purpose (U+00A0 dual pot)', async () => {
      await expect(
        db.sql`
          INSERT INTO accounts (owner_type, owner_id, asset_id, kind, purpose)
          VALUES ('user'::owner_type, ${USER}, 'USDT', 'hold'::account_kind, ${'order:x\u00a0'})
        `,
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });
    });

    it('REFUSES purpose on available — fungible pot must stay one row', async () => {
      // Same failure class as assertAvailableUnpurposed on the TypeScript path.
      await expect(
        db.sql`
          INSERT INTO accounts (owner_type, owner_id, asset_id, kind, purpose)
          VALUES ('user'::owner_type, ${USER}, 'USDT', 'available'::account_kind, 'split')
        `,
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });
    });
  });
}
