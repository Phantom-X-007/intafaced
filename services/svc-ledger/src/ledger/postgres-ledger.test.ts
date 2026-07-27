import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { createTestDb, postgresAvailable, rewriteSchemaSql, type TestDb } from '@intafaced/db';
import { runLedgerConformance } from '@intafaced/ledger-client/testing';
import { formatAmount, parseAmount as amt, recipes, userAvailable } from '@intafaced/ledger-client';
import { PostgresLedger } from './postgres-ledger.js';
import { reconcileBalances, verifyChain, totalsByAsset, runReconciliation } from './reconcile.js';

/**
 * svc-ledger runs the SAME conformance suite as the in-memory reference
 * (§4.4). If the two ever disagree, one of them is wrong and the suite decides.
 *
 * Isolation: every suite run gets its own Postgres schema via `createTestDb`.
 * Two worktrees can run this file at once without TRUNCATE races on the shared
 * `ledger` schema (the failure mode that looks exactly like insufficient-funds).
 *
 * Requires Postgres. `docker compose up -d`, then
 * `pnpm --filter @intafaced/svc-ledger test`. Skips cleanly when unreachable.
 */

// Ops role can CREATE SCHEMA; the service role cannot. Host port is 5433
// (docker-compose); override with TEST_DATABASE_URL when needed.
const URL = process.env.TEST_DATABASE_URL ?? 'postgres://intafaced_ops:intafaced_ops@localhost:5433/intafaced';
const here = dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(join(here, '..', '..', 'drizzle', '0000_ledger_init.sql'), 'utf8');

const available = await postgresAvailable(URL);

if (!available) {
  describe.skip('svc-ledger (Postgres unavailable — start docker compose)', () => {
    it('skipped', () => undefined);
  });
} else {
  let db: TestDb;
  let engine: PostgresLedger;

  // Build the schema before describe() so the conformance helper can register.
  db = await createTestDb({
    service: 'ledger',
    url: URL,
    migrations: [(schema) => rewriteSchemaSql(migration, 'ledger', schema)],
  });
  engine = new PostgresLedger(db.sql);

  /**
   * Wipe transactional state without dropping the singleton chain tip or the
   * asset seed — same shape as the old shared-schema truncate, scoped to
   * *this* suite's schema via search_path.
   */
  const reset = async () => {
    await db.sql`
      TRUNCATE ledger_entries, ledger_tx, balance_snapshots, accounts RESTART IDENTITY CASCADE
    `;
    await db.sql`UPDATE chain_tip SET hash = NULL, seq = 0 WHERE id = true`;
  };

  runLedgerConformance('PostgresLedger', async () => ({
    ledger: engine,
    reset,
    journal: () => engine.journal(),
    reconcile: async () => reconcileBalances(db.sql),
    verifyChain: async () => verifyChain(db.sql),
    totalsByAsset: async () => totalsByAsset(db.sql),
  }));

  // ── Postgres-specific behaviour the reference cannot exercise ──────────────

  describe('svc-ledger — database-level guarantees', () => {
    beforeAll(reset);
    afterAll(async () => {
      await db.drop();
    });

    const USER = '99999999-9999-4999-8999-999999999999';

    it('uses a unique schema so parallel suites cannot share state', () => {
      // Structural guarantee: createTestDb names include pid + counter.
      expect(db.schema).toMatch(/^test_ledger_\d+_\d+$/);
      expect(db.schema).not.toBe('ledger');
    });

    it('the database itself refuses a negative non-treasury balance', async () => {
      // Bypass the service entirely: even direct SQL cannot create money.
      await db.sql`
        INSERT INTO accounts (owner_type, owner_id, asset_id, kind)
        VALUES ('user', ${USER}, 'BTC', 'available')
        ON CONFLICT DO NOTHING
      `;

      await expect(
        db.sql`UPDATE accounts SET balance = -1 WHERE owner_type = 'user' AND owner_id = ${USER} AND asset_id = 'BTC'`,
      ).rejects.toThrow(/accounts_non_negative_ck/);
    });

    it('the database itself refuses a zero-amount entry', async () => {
      const [tx] = await db.sql<Array<{ id: string }>>`
        INSERT INTO ledger_tx (idempotency_key, module, reason, hash)
        VALUES (${`ck-test-${Date.now()}`}, 'test', 'test', 'deadbeef') RETURNING id
      `;
      const [account] = await db.sql<Array<{ id: string }>>`
        SELECT id FROM accounts WHERE owner_type = 'user' AND owner_id = ${USER} AND asset_id = 'BTC'
      `;

      await expect(
        db.sql`
          INSERT INTO ledger_entries (tx_id, account_id, asset_id, direction, amount, balance_after)
          VALUES (${tx!.id}, ${account!.id}, 'BTC', 'debit', 0, 0)
        `,
      ).rejects.toThrow(/ledger_entries_positive_ck/);
    });

    it('rejects a duplicate idempotency key at the unique index', async () => {
      const key = `dupe-test-${Date.now()}`;
      await db.sql`INSERT INTO ledger_tx (idempotency_key, module, reason, hash) VALUES (${key}, 't', 't', 'a')`;
      await expect(
        db.sql`INSERT INTO ledger_tx (idempotency_key, module, reason, hash) VALUES (${key}, 't', 't', 'b')`,
      ).rejects.toThrow(/ledger_tx_idempotency_idx/);
    });

    it('preserves full 18-decimal precision through a round trip', async () => {
      await reset();
      const precise = '0.123456789012345678';
      await engine.post(recipes.deposit({ userId: USER, assetId: 'ETH', amount: amt(precise), rail: 'test', railRef: 'precision-1' }));
      const balance = await engine.balance(userAvailable(USER, 'ETH'));
      expect(formatAmount(balance.amount)).toBe(precise);
    });

    it('records balance_after on every entry, matching the final state', async () => {
      await reset();
      await engine.post(recipes.deposit({ userId: USER, assetId: 'USDT', amount: amt('100'), rail: 'test', railRef: 'ba-1' }));
      await engine.post(recipes.orderHold({ orderId: 'ba-o1', userId: USER, assetId: 'USDT', amount: amt('30') }));

      const journal = await engine.journal();
      const last = journal.at(-1)!;
      const availableLeg = last.entries.find((e) => e.direction === 'credit')!;
      expect(formatAmount(availableLeg.balanceAfter)).toBe('70');
    });

    it('detects tampering after the fact', async () => {
      await reset();
      await engine.post(recipes.deposit({ userId: USER, assetId: 'USDT', amount: amt('100'), rail: 'test', railRef: 'tamper-1' }));
      await engine.post(recipes.deposit({ userId: USER, assetId: 'USDT', amount: amt('200'), rail: 'test', railRef: 'tamper-2' }));

      expect(await verifyChain(db.sql)).toMatchObject({ ok: true });

      // Someone with database access inflates an entry.
      await db.sql`
        UPDATE ledger_entries SET amount = 999999
         WHERE id = (SELECT MIN(id) FROM ledger_entries)
      `;

      const result = await verifyChain(db.sql);
      expect(result.ok).toBe(false);
    });

    it('reconciliation catches a balance that no longer matches its entries', async () => {
      await reset();
      await engine.post(recipes.deposit({ userId: USER, assetId: 'USDT', amount: amt('100'), rail: 'test', railRef: 'recon-1' }));

      expect(await reconcileBalances(db.sql)).toMatchObject({ ok: true });

      // Corrupt the denormalised cache without touching the entries.
      await db.sql`
        UPDATE accounts SET balance = 150
         WHERE owner_type = 'user' AND owner_id = ${USER} AND asset_id = 'USDT' AND kind = 'available'
      `;

      const result = await reconcileBalances(db.sql);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.drift[0]?.cached).toBe('150');
        expect(result.drift[0]?.replayed).toBe('100');
        expect(result.drift[0]?.difference).toBe('50');
      }
    });

    it('a full reconciliation run reports every asset netting to zero', async () => {
      await reset();
      await engine.post(recipes.deposit({ userId: USER, assetId: 'USDT', amount: amt('500'), rail: 'test', railRef: 'full-1' }));
      await engine.post(recipes.orderHold({ orderId: 'full-o1', userId: USER, assetId: 'USDT', amount: amt('200') }));

      const report = await runReconciliation(db.sql);
      expect(report.ok).toBe(true);
      expect(report.unbalancedAssets).toEqual([]);
      expect(report.totals.USDT).toBe('0');
    });

    it('holds zero drift across 200 sequential posts', async () => {
      await reset();
      await engine.post(recipes.deposit({ userId: USER, assetId: 'USDT', amount: amt('100000'), rail: 'test', railRef: 'vol-1' }));

      for (let i = 0; i < 100; i++) {
        await engine.post(recipes.orderHold({ orderId: `vol-${i}`, userId: USER, assetId: 'USDT', amount: amt('10') }));
        await engine.post(recipes.orderHoldRelease({ orderId: `vol-${i}`, userId: USER, assetId: 'USDT', amount: amt('10') }));
      }

      expect(formatAmount((await engine.balance(userAvailable(USER, 'USDT'))).amount)).toBe('100000');
      expect(await reconcileBalances(db.sql)).toMatchObject({ ok: true });
      expect(await verifyChain(db.sql)).toMatchObject({ ok: true });
      expect((await totalsByAsset(db.sql)).USDT).toBe('0');
    }, 60_000);

    it('serialises 50 concurrent posts without drift or a broken chain', async () => {
      await reset();
      await engine.post(recipes.deposit({ userId: USER, assetId: 'USDT', amount: amt('10000'), rail: 'test', railRef: 'conc-1' }));

      await Promise.all(
        Array.from({ length: 50 }, (_, i) =>
          engine.post(recipes.orderHold({ orderId: `conc-${i}`, userId: USER, assetId: 'USDT', amount: amt('10') })),
        ),
      );

      expect(formatAmount((await engine.balance(userAvailable(USER, 'USDT'))).amount)).toBe('9500');
      expect(await reconcileBalances(db.sql)).toMatchObject({ ok: true });
      // The chain must still be intact: concurrency must not fork it.
      expect(await verifyChain(db.sql)).toMatchObject({ ok: true });
    }, 60_000);
  });
}
