import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, postgresAvailable, type TestDatabase } from '@intafaced/db';
import { MemoryLedger, parseAmount as amt, recipes, userAvailable, formatAmount } from '@intafaced/ledger-client';
import { createBankServices } from '../bank-service.js';
import { memoryLedgerHistory } from '../analytics/ledger-history.js';
import { BankError } from '../errors.js';
import type { ConvertPort } from './auto-invest-service.js';

/**
 * CAN INDEX WIRE CONVERT? (bank.auto-invest — same missing-wiring shape as cards)
 *
 * auto-invest.test.ts injects ConvertPort on createBankServices. That cannot
 * prove index.ts passes `autoInvest.convert`. Before this pin, convert lived
 * only in tests; production always refused rate_unset.
 */

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..', '..', '..');
const drizzle = join(here, '../..', 'drizzle');
const migrations = readdirSync(drizzle)
  .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
  .sort()
  .map((f) => readFileSync(join(drizzle, f), 'utf8'));

const DB_URL = process.env.TEST_DATABASE_URL ?? 'postgres://intafaced_ops:intafaced_ops@localhost:5433/intafaced_test';
const USER_A = '11111111-1111-4111-8111-111111111111';

describe('index.ts boot-wires autoInvest.convert (cards/ramps shape)', () => {
  const indexSrc = readFileSync(join(ROOT, 'services/svc-bank/src/index.ts'), 'utf8');

  it('passes convert into createBankServices autoInvest when TRADE_URL is usable', () => {
    expect(indexSrc).toMatch(/tradeConvertPort/);
    expect(indexSrc).toMatch(/usableTradeConvertUrl\(env\.TRADE_URL\)/);
    expect(indexSrc).toMatch(/convert:\s*tradeConvertPort\(/);
    expect(indexSrc).toMatch(/autoInvest:\s*\{/);
  });

  it('would go red if convert were dropped from the autoInvest boot object', () => {
    const autoBlock = indexSrc.slice(indexSrc.indexOf('autoInvest: {'));
    const slice = autoBlock.slice(0, 900);
    expect(slice).toMatch(/convert:\s*tradeConvertPort/);
    expect(indexSrc).not.toMatch(/autoInvest:\s*\{\s*enabled:\s*env\.AUTO_INVEST_ENABLED\s*\}/);
  });
});

const available = await postgresAvailable(DB_URL);

if (!available) {
  describe.skip('auto-invest convert reachability (Postgres unavailable)', () => {
    it('skipped', () => undefined);
  });
} else {
  const db: TestDatabase = await createTestDatabase({ service: 'bank', url: DB_URL, migrations });
  const sql = db.sql;

  afterAll(async () => {
    await db.drop();
  }, 30_000);

  describe('boot-shaped createBankServices convert wiring', () => {
    let ledger: MemoryLedger;

    beforeEach(async () => {
      await sql`
        TRUNCATE bank.auto_invest_runs, bank.auto_invest_rules,
                 bank.interest_accruals, bank.earn_positions, bank.earn_pools,
                 bank.spaces
        RESTART IDENTITY CASCADE
      `;
      ledger = new MemoryLedger();
    });

    async function fund(userId: string, assetId: string, value: string) {
      await ledger.post(
        recipes.deposit({
          userId,
          assetId,
          amount: amt(value),
          rail: 'test',
          railRef: `${userId}:${assetId}:${randomUUID()}`,
        }),
      );
    }

    const fakeConvert = (book: MemoryLedger): ConvertPort => ({
      async convert(input) {
        await book.post(
          recipes.withdrawHold({
            userId: input.userId,
            assetId: input.fromAsset,
            amount: input.fromAmount,
            rail: 'test-convert',
            withdrawalId: input.clientConvertId,
          }),
        );
        await book.post(
          recipes.withdrawSettle({
            userId: input.userId,
            assetId: input.fromAsset,
            amount: input.fromAmount,
            rail: 'test-convert',
            withdrawalId: input.clientConvertId,
          }),
        );
        await book.post(
          recipes.deposit({
            userId: input.userId,
            assetId: input.toAsset,
            amount: input.fromAmount,
            rail: 'test-convert',
            railRef: `${input.clientConvertId}:in`,
          }),
        );
        return { toAmount: input.fromAmount, ledgerTxId: `tx:${input.clientConvertId}` };
      },
    });

    it('boot-shaped wiring with a fake convert settles DCA', async () => {
      const bank = createBankServices(sql, ledger, memoryLedgerHistory(ledger), {
        nativeAssetId: 'IFC',
        autoInvest: { enabled: true, convert: fakeConvert(ledger) },
      });
      await fund(USER_A, 'USDT', '500');
      const rule = await bank.autoInvest.createDca({
        userId: USER_A,
        spendAssetId: 'USDT',
        buyAssetId: 'BTC',
        amount: amt('100'),
        cadence: 'daily',
        startsAt: new Date('2026-08-01T00:00:00Z'),
      });
      const report = await bank.autoInvest.runDue({ now: new Date('2026-08-09T00:00:00Z') });
      expect(report.settled).toBe(1);
      expect(formatAmount((await ledger.balance(userAvailable(USER_A, 'USDT'))).amount)).toBe('400');
      expect(formatAmount((await ledger.balance(userAvailable(USER_A, 'BTC'))).amount)).toBe('100');
      expect(rule.kind).toBe('dca');
    });

    it('no convert → named refuse', async () => {
      const bank = createBankServices(sql, ledger, memoryLedgerHistory(ledger), {
        nativeAssetId: 'IFC',
        autoInvest: { enabled: true },
      });
      await expect(
        bank.autoInvest.createDca({
          userId: USER_A,
          spendAssetId: 'USDT',
          buyAssetId: 'BTC',
          amount: amt('100'),
          cadence: 'daily',
          startsAt: new Date('2026-08-09T00:00:00Z'),
        }),
      ).rejects.toMatchObject({ code: 'bank.auto_invest_rate_unset' });
    });

    it('convert failure does not invent a price', async () => {
      let converted = 0;
      const failing: ConvertPort = {
        async convert() {
          converted += 1;
          throw new BankError('trade.convert_no_liquidity', 'bank.auto_invest_rate_unset');
        },
      };
      const bank = createBankServices(sql, ledger, memoryLedgerHistory(ledger), {
        nativeAssetId: 'IFC',
        autoInvest: { enabled: true, convert: failing },
      });
      await fund(USER_A, 'USDT', '500');
      await bank.autoInvest.createDca({
        userId: USER_A,
        spendAssetId: 'USDT',
        buyAssetId: 'BTC',
        amount: amt('100'),
        cadence: 'daily',
        startsAt: new Date('2026-08-01T00:00:00Z'),
      });
      const report = await bank.autoInvest.runDue({ now: new Date('2026-08-09T00:00:00Z') });
      expect(converted).toBe(1);
      expect(report.settled).toBe(0);
      expect(formatAmount((await ledger.balance(userAvailable(USER_A, 'USDT'))).amount)).toBe('500');
      expect(formatAmount((await ledger.balance(userAvailable(USER_A, 'BTC'))).amount)).toBe('0');
    });
  });
}
