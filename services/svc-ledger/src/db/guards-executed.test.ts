import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { createTestDb, postgresAvailable, rewriteSchemaSql, type TestDb } from '@intafaced/db';

/**
 * THE GUARDS NOTHING EVER EXECUTED.
 *
 * D5 sweep. Every database-level guard in `svc-ledger`, checked for a test that
 * actually makes it refuse something. Four came back with no such test — and the
 * reason it looked covered is worth writing down, because the same illusion will
 * form again.
 *
 * `schema-drift.test.ts` mentions all of them. That test builds the database from
 * `drizzle/*.sql` and from `schema.ts` and requires the two to be identical, so it
 * proves each constraint EXISTS and is described consistently. It is an excellent
 * gate and it is not this one: a constraint can exist, be named correctly in both
 * descriptions, and still refuse nothing, because `CHECK (true)` is a valid CHECK.
 * Existence is not enforcement.
 *
 * That distinction has already cost this repo twice — #1039 (the no-double-send
 * guard executed by no test) and #1040 (a NATS container CI ran for months with
 * nothing connected to it). Both were found by asking of a guard: what runs it?
 *
 * The four here:
 *
 *   · `ledger_entries_asset_id_fk` — the ENTRIES half of #1044, which had no
 *      coverage of any kind. #1044's own claim is that "value could exist in an
 *      asset the ledger had never heard of"; it was proven for `accounts` in
 *      `asset-registry.test.ts` and never for `ledger_entries`, which is the
 *      table the value is actually recorded in.
 *   · `chain_tip_singleton_ck` — 0000: two rows "would raise the question which
 *      one is true", and the hash chain is built on there being one answer.
 *   · `posting_freeze_singleton_ck` — same argument, on the kill-switch.
 *   · `accounts_purpose_len_ck` — `purpose` is part of the identity index, so its
 *      128-character cap is a bound on a business key, not a display limit.
 *
 * Raw SQL throughout, ledger-client out of the picture — the point of a database
 * backstop is that it holds when the TypeScript path is not the one writing.
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
const FK_VIOLATION = '23503';
const USER = '5f1e9c62-0d3a-4a7e-9b21-8c4a6f0e1d55';

const available = await postgresAvailable(URL);

if (!available) {
  describe.skip('svc-ledger guards executed (Postgres unavailable)', () => {
    it('skipped', () => undefined);
  });
} else {
  describe('the database guards, made to refuse something', () => {
    let db: TestDb;

    beforeAll(async () => {
      db = await createTestDb({ service: 'ledger_guards', url: URL, migrations });
    });
    afterAll(async () => {
      await db?.drop();
    });

    describe('ledger_entries_asset_id_fk — the entries half of #1044', () => {
      /**
       * A real transaction and a real account, so the only thing wrong with the
       * entry is its asset. Without this setup the `tx_id` and `account_id`
       * foreign keys would fail first and the test would pass for the wrong
       * reason — which is how a test ends up asserting nothing.
       *
       * A FRESH OWNER EACH TIME. `accounts_identity_purpose_idx` is UNIQUE on
       * (owner_type, owner_id, asset_id, kind, purpose), so reusing one owner made
       * the second call collide on the identity index — which is the index doing
       * its job, and it failed these tests on the first CI run. `randomUUID`
       * satisfies `accounts_owner_id_space_ck`, which requires the `user` space to
       * be a UUID.
       */
      let probe = 0;
      async function realTxAndAccount(assetId = 'USDT'): Promise<{ txId: string; accountId: string }> {
        probe += 1;
        const [tx] = await db.sql<Array<{ id: string }>>`
          INSERT INTO ledger_tx (idempotency_key, module, reason, hash)
          VALUES (${`guards-fk-probe-${probe}`}, 'test', 'entries asset fk probe', ${`h-guards-fk-${probe}`})
          RETURNING id
        `;
        const [account] = await db.sql<Array<{ id: string }>>`
          INSERT INTO accounts (owner_type, owner_id, asset_id, kind, purpose)
          VALUES ('user'::owner_type, ${randomUUID()}, ${assetId}, 'available'::account_kind, '')
          RETURNING id
        `;
        return { txId: tx!.id, accountId: account!.id };
      }

      it('REFUSES an entry in an asset that was never registered', async () => {
        const { txId, accountId } = await realTxAndAccount();

        await expect(
          db.sql`
            INSERT INTO ledger_entries (tx_id, account_id, asset_id, direction, amount, balance_after)
            VALUES (${txId}, ${accountId}, 'NOTANASSET', 'credit'::direction, 1::numeric, 1::numeric)
          `,
        ).rejects.toMatchObject({ code: FK_VIOLATION });
      });

      it('accepts the same entry in a registered asset — so the refusal is about the asset', async () => {
        const { txId, accountId } = await realTxAndAccount();

        await expect(
          db.sql`
            INSERT INTO ledger_entries (tx_id, account_id, asset_id, direction, amount, balance_after)
            VALUES (${txId}, ${accountId}, 'USDT', 'credit'::direction, 1::numeric, 1::numeric)
          `,
        ).resolves.toBeDefined();
      });

      /**
       * ISOLATED TO THE ENTRIES FK ON PURPOSE.
       *
       * `DELETE FROM assets WHERE id = 'USDT'` would be restricted by
       * `accounts_asset_id_fk` as well, since accounts hold an asset too — so the
       * obvious version of this test passes even if the entries FK does not exist,
       * which is the exact failure mode this PR is about.
       *
       * So: a purpose-made asset referenced ONLY by an entry. The account stays in
       * `USDT` while the entry names `ENTFK`, which is possible because nothing ties
       * `ledger_entries.asset_id` to its account's asset — recorded as its own
       * finding in the audit file, and what makes this isolation available here.
       */
      it('and an asset cannot be deleted out from under an entry alone (ON DELETE RESTRICT)', async () => {
        await db.sql`INSERT INTO assets (id, kind, decimals) VALUES ('ENTFK', 'crypto', 18) ON CONFLICT (id) DO NOTHING`;
        const { txId, accountId } = await realTxAndAccount();

        await db.sql`
          INSERT INTO ledger_entries (tx_id, account_id, asset_id, direction, amount, balance_after)
          VALUES (${txId}, ${accountId}, 'ENTFK', 'debit'::direction, 1::numeric, 1::numeric)
        `;

        // No account holds ENTFK, so only the entries FK can be doing the refusing.
        const holders = await db.sql<Array<{ n: string }>>`SELECT count(*) AS n FROM accounts WHERE asset_id = 'ENTFK'`;
        expect(Number(holders[0]!.n)).toBe(0);

        await expect(db.sql`DELETE FROM assets WHERE id = 'ENTFK'`).rejects.toMatchObject({ code: FK_VIOLATION });
      });
    });

    describe('the singletons — one row, because two would raise "which one is true"', () => {
      it('chain_tip REFUSES a second row', async () => {
        // `id = false` is the case the CHECK exists for. `id = true` is refused by
        // the primary key, which is a different guard, so both are asserted.
        await expect(db.sql`INSERT INTO chain_tip (id, hash, seq) VALUES (false, 'other', 1)`).rejects.toMatchObject({
          code: CHECK_VIOLATION,
        });
        await expect(db.sql`INSERT INTO chain_tip (id, hash, seq) VALUES (true, 'other', 1)`).rejects.toMatchObject({
          code: '23505',
        });

        const rows = await db.sql<Array<{ n: string }>>`SELECT count(*) AS n FROM chain_tip`;
        expect(Number(rows[0]!.n)).toBe(1);
      });

      it('posting_freeze REFUSES a second row', async () => {
        await expect(
          db.sql`INSERT INTO posting_freeze (id, frozen, reason, actor) VALUES (false, true, 'other', 'other')`,
        ).rejects.toMatchObject({ code: CHECK_VIOLATION });

        const rows = await db.sql<Array<{ n: string }>>`SELECT count(*) AS n FROM posting_freeze`;
        expect(Number(rows[0]!.n)).toBe(1);
      });
    });

    describe('accounts_purpose_len_ck — a bound on a business key, not a display limit', () => {
      it('REFUSES a purpose past 128 characters', async () => {
        await expect(
          db.sql`
            INSERT INTO accounts (owner_type, owner_id, asset_id, kind, purpose)
            VALUES ('user'::owner_type, ${USER}, 'USDT', 'hold'::account_kind, ${'loan:' + 'a'.repeat(124)})
          `,
        ).rejects.toMatchObject({ code: CHECK_VIOLATION });
      });

      it('accepts exactly 128, so the boundary is where the constraint says', async () => {
        await expect(
          db.sql`
            INSERT INTO accounts (owner_type, owner_id, asset_id, kind, purpose)
            VALUES ('user'::owner_type, ${USER}, 'USDT', 'hold'::account_kind, ${'a'.repeat(128)})
          `,
        ).resolves.toBeDefined();
      });
    });
  });
}
