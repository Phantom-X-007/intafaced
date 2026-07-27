import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { runLedgerConformance } from '@intafaced/ledger-client/testing';
import { formatAmount, parseAmount as amt, recipes, userAvailable } from '@intafaced/ledger-client';
import { PostgresLedger } from './postgres-ledger.js';
import { reconcileBalances, verifyChain, totalsByAsset, runReconciliation } from './reconcile.js';

/**
 * svc-ledger runs the SAME conformance suite as the in-memory reference
 * (§4.4). If the two ever disagree, one of them is wrong and the suite decides.
 *
 * Requires Postgres. `docker compose up -d`, then `pnpm --filter @intafaced/svc-ledger test`.
 * Skips cleanly when the database is unreachable so a laptop without Docker can
 * still run the rest of the monorepo's tests.
 */

const URL = process.env.TEST_DATABASE_URL ?? 'postgres://svc_ledger:svc_ledger@localhost:5433/intafaced';
const here = dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(join(here, '..', '..', 'drizzle', '0000_ledger_init.sql'), 'utf8');

async function reachable(): Promise<boolean> {
  const probe = postgres(URL, { max: 1, connect_timeout: 3, onnotice: () => undefined });
  try {
    await probe`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await probe.end({ timeout: 2 }).catch(() => undefined);
  }
}

const available = await reachable();

if (!available) {
  describe.skip('svc-ledger (Postgres unavailable — start docker compose)', () => {
    it('skipped', () => undefined);
  });
} else {
  const sql = postgres(URL, {
    max: 8,
    connection: { search_path: 'ledger,public', application_name: 'svc-ledger-test' },
    onnotice: () => undefined,
  });

  // The migration is idempotent (IF NOT EXISTS throughout), so this doubles as
  // a test that re-running it is safe.
  await sql.unsafe(migration);

  const truncate = async () => {
    await sql`TRUNCATE ledger.ledger_entries, ledger.ledger_tx, ledger.balance_snapshots, ledger.accounts RESTART IDENTITY CASCADE`;
    await sql`UPDATE ledger.chain_tip SET hash = NULL, seq = 0 WHERE id = true`;
  };

  const engine = new PostgresLedger(sql);

  runLedgerConformance('PostgresLedger', async () => ({
    ledger: engine,
    reset: truncate,
    journal: () => engine.journal(),
    reconcile: async () => reconcileBalances(sql),
    verifyChain: async () => verifyChain(sql),
    totalsByAsset: async () => totalsByAsset(sql),
  }));

  // ── Postgres-specific behaviour the reference cannot exercise ──────────────

  describe('svc-ledger — database-level guarantees', () => {
    beforeAll(truncate);
    afterAll(async () => {
      await sql.end({ timeout: 5 });
    });

    const USER = '99999999-9999-4999-8999-999999999999';

    it('the database itself refuses a negative non-treasury balance', async () => {
      // Bypass the service entirely: even direct SQL cannot create money.
      await sql`
        INSERT INTO ledger.accounts (owner_type, owner_id, asset_id, kind)
        VALUES ('user', ${USER}, 'BTC', 'available')
        ON CONFLICT DO NOTHING
      `;

      await expect(
        sql`UPDATE ledger.accounts SET balance = -1 WHERE owner_type = 'user' AND owner_id = ${USER} AND asset_id = 'BTC'`,
      ).rejects.toThrow(/accounts_non_negative_ck/);
    });

    it('the database itself refuses a zero-amount entry', async () => {
      const [tx] = await sql<Array<{ id: string }>>`
        INSERT INTO ledger.ledger_tx (idempotency_key, module, reason, hash)
        VALUES (${`ck-test-${Date.now()}`}, 'test', 'test', 'deadbeef') RETURNING id
      `;
      const [account] = await sql<Array<{ id: string }>>`
        SELECT id FROM ledger.accounts WHERE owner_type = 'user' AND owner_id = ${USER} AND asset_id = 'BTC'
      `;

      await expect(
        sql`
          INSERT INTO ledger.ledger_entries (tx_id, account_id, asset_id, direction, amount, balance_after)
          VALUES (${tx!.id}, ${account!.id}, 'BTC', 'debit', 0, 0)
        `,
      ).rejects.toThrow(/ledger_entries_positive_ck/);
    });

    it('rejects a duplicate idempotency key at the unique index', async () => {
      const key = `dupe-test-${Date.now()}`;
      await sql`INSERT INTO ledger.ledger_tx (idempotency_key, module, reason, hash) VALUES (${key}, 't', 't', 'a')`;
      await expect(
        sql`INSERT INTO ledger.ledger_tx (idempotency_key, module, reason, hash) VALUES (${key}, 't', 't', 'b')`,
      ).rejects.toThrow(/ledger_tx_idempotency_idx/);
    });

    it('preserves full 18-decimal precision through a round trip', async () => {
      await truncate();
      const precise = '0.123456789012345678';
      await engine.post(recipes.deposit({ userId: USER, assetId: 'ETH', amount: amt(precise), rail: 'test', railRef: 'precision-1' }));
      const balance = await engine.balance(userAvailable(USER, 'ETH'));
      expect(formatAmount(balance.amount)).toBe(precise);
    });

    it('records balance_after on every entry, matching the final state', async () => {
      await truncate();
      await engine.post(recipes.deposit({ userId: USER, assetId: 'USDT', amount: amt('100'), rail: 'test', railRef: 'ba-1' }));
      await engine.post(recipes.orderHold({ orderId: 'ba-o1', userId: USER, assetId: 'USDT', amount: amt('30') }));

      const journal = await engine.journal();
      const last = journal.at(-1)!;
      const availableLeg = last.entries.find((e) => e.direction === 'credit')!;
      expect(formatAmount(availableLeg.balanceAfter)).toBe('70');
    });

    it('detects tampering after the fact', async () => {
      await truncate();
      await engine.post(recipes.deposit({ userId: USER, assetId: 'USDT', amount: amt('100'), rail: 'test', railRef: 'tamper-1' }));
      await engine.post(recipes.deposit({ userId: USER, assetId: 'USDT', amount: amt('200'), rail: 'test', railRef: 'tamper-2' }));

      expect(await verifyChain(sql)).toMatchObject({ ok: true });

      // Someone with database access inflates an entry.
      await sql`
        UPDATE ledger.ledger_entries SET amount = 999999
         WHERE id = (SELECT MIN(id) FROM ledger.ledger_entries)
      `;

      const result = await verifyChain(sql);
      expect(result.ok).toBe(false);
    });

    it('reconciliation catches a balance that no longer matches its entries', async () => {
      await truncate();
      await engine.post(recipes.deposit({ userId: USER, assetId: 'USDT', amount: amt('100'), rail: 'test', railRef: 'recon-1' }));

      expect(await reconcileBalances(sql)).toMatchObject({ ok: true });

      // Corrupt the denormalised cache without touching the entries.
      await sql`
        UPDATE ledger.accounts SET balance = 150
         WHERE owner_type = 'user' AND owner_id = ${USER} AND asset_id = 'USDT' AND kind = 'available'
      `;

      const result = await reconcileBalances(sql);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.drift[0]?.cached).toBe('150');
        expect(result.drift[0]?.replayed).toBe('100');
        expect(result.drift[0]?.difference).toBe('50');
      }
    });

    it('a full reconciliation run reports every asset netting to zero', async () => {
      await truncate();
      await engine.post(recipes.deposit({ userId: USER, assetId: 'USDT', amount: amt('500'), rail: 'test', railRef: 'full-1' }));
      await engine.post(recipes.orderHold({ orderId: 'full-o1', userId: USER, assetId: 'USDT', amount: amt('200') }));

      const report = await runReconciliation(sql);
      expect(report.ok).toBe(true);
      expect(report.unbalancedAssets).toEqual([]);
      expect(report.totals.USDT).toBe('0');
    });

    it('holds zero drift across 200 sequential posts', async () => {
      await truncate();
      await engine.post(recipes.deposit({ userId: USER, assetId: 'USDT', amount: amt('100000'), rail: 'test', railRef: 'vol-1' }));

      for (let i = 0; i < 100; i++) {
        await engine.post(recipes.orderHold({ orderId: `vol-${i}`, userId: USER, assetId: 'USDT', amount: amt('10') }));
        await engine.post(recipes.orderHoldRelease({ orderId: `vol-${i}`, userId: USER, assetId: 'USDT', amount: amt('10') }));
      }

      expect(formatAmount((await engine.balance(userAvailable(USER, 'USDT'))).amount)).toBe('100000');
      expect(await reconcileBalances(sql)).toMatchObject({ ok: true });
      expect(await verifyChain(sql)).toMatchObject({ ok: true });
      expect((await totalsByAsset(sql)).USDT).toBe('0');
    }, 60_000);

    it('serialises 50 concurrent posts without drift or a broken chain', async () => {
      await truncate();
      await engine.post(recipes.deposit({ userId: USER, assetId: 'USDT', amount: amt('10000'), rail: 'test', railRef: 'conc-1' }));

      await Promise.all(
        Array.from({ length: 50 }, (_, i) =>
          engine.post(recipes.orderHold({ orderId: `conc-${i}`, userId: USER, assetId: 'USDT', amount: amt('10') })),
        ),
      );

      expect(formatAmount((await engine.balance(userAvailable(USER, 'USDT'))).amount)).toBe('9500');
      expect(await reconcileBalances(sql)).toMatchObject({ ok: true });
      // The chain must still be intact: concurrency must not fork it.
      expect(await verifyChain(sql)).toMatchObject({ ok: true });
    }, 60_000);
  });
}
