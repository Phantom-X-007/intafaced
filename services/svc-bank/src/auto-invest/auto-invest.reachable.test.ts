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
import { tradeConvertPort } from './trade-convert-port.js';

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
const EDGE = 'a-bank-auto-invest-convert-edge-secret-32ch';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

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

  it('live job path is tradeConvertPort convert.quote — not a bank mid', () => {
    const serviceSrc = readFileSync(join(here, 'auto-invest-service.ts'), 'utf8');
    const portSrc = readFileSync(join(here, 'trade-convert-port.ts'), 'utf8');
    const routerSrc = readFileSync(join(here, '..', 'router.ts'), 'utf8');
    expect(indexSrc).toMatch(/\/internal\/jobs\/run-auto-invest/);
    expect(indexSrc).toMatch(/bank\.autoInvest\.runDue/);
    expect(routerSrc).toMatch(/runAutoInvest:/);
    expect(routerSrc).toMatch(/autoInvest\.runDue/);
    expect(serviceSrc).toMatch(/this\.convert\.convert\(/);
    expect(portSrc).toMatch(/\/trpc\/convert\.quote/);
    expect(portSrc).toMatch(/\/trpc\/convert\.execute/);
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

    it('runDue through tradeConvertPort hits convert.quote — no bank mid', async () => {
      const seen: string[] = [];
      const convert = tradeConvertPort({
        baseUrl: 'http://svc-trade:4004',
        edgeSecret: EDGE,
        fetchImpl: async (input) => {
          const url = String(input);
          seen.push(url);
          if (url.includes('/api/v1/markets')) {
            return jsonResponse(200, [
              {
                symbol: 'BTC/USDT',
                base: 'BTC',
                quote: 'USDT',
                spot: true,
                active: true,
                limits: { amount: { min: '0.001' } },
              },
            ]);
          }
          if (url.includes('/trpc/convert.quote')) {
            return jsonResponse(200, {
              result: {
                data: {
                  symbol: 'BTC/USDT',
                  side: 'buy',
                  requestedQty: '0.002',
                  filledQty: '0.002',
                  userNotional: '100',
                  avgPrice: '50000',
                  fullyFilled: true,
                },
              },
            });
          }
          if (url.includes('/trpc/convert.execute')) {
            return jsonResponse(200, {
              result: {
                data: {
                  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                  filled: '0.002',
                  remaining: '0',
                  status: 'filled',
                },
              },
            });
          }
          return jsonResponse(404, { error: { message: 'unexpected' } });
        },
      });
      const bank = createBankServices(sql, ledger, memoryLedgerHistory(ledger), {
        nativeAssetId: 'IFC',
        autoInvest: { enabled: true, convert },
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
      expect(seen.some((u) => u.includes('/trpc/convert.quote'))).toBe(true);
      expect(seen.some((u) => u.includes('/trpc/convert.execute'))).toBe(true);
      expect(report.settled).toBe(1);
      const runs = await bank.autoInvest.runsOf(rule.id);
      expect(runs[0]?.ledgerTxId).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
      // HTTP mock is trade's fill — bank does not post a mid or move USDT itself.
      expect(formatAmount((await ledger.balance(userAvailable(USER_A, 'USDT'))).amount)).toBe('500');
    });

    it('runDue through tradeConvertPort names rate_unset when convert.quote fails', async () => {
      const convert = tradeConvertPort({
        baseUrl: 'http://svc-trade:4004',
        edgeSecret: EDGE,
        fetchImpl: async (input) => {
          const url = String(input);
          if (url.includes('/api/v1/markets')) {
            return jsonResponse(200, [
              { symbol: 'BTC/USDT', base: 'BTC', quote: 'USDT', spot: true, active: true, limits: { amount: { min: '0.001' } } },
            ]);
          }
          return jsonResponse(400, {
            error: { message: 'insufficient book depth', data: { intafacedCode: 'trade.convert_insufficient_depth' } },
          });
        },
      });
      const bank = createBankServices(sql, ledger, memoryLedgerHistory(ledger), {
        nativeAssetId: 'IFC',
        autoInvest: { enabled: true, convert },
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
      expect(report.settled).toBe(0);
      expect(report.rejected).toBe(1);
      expect(formatAmount((await ledger.balance(userAvailable(USER_A, 'USDT'))).amount)).toBe('500');
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
