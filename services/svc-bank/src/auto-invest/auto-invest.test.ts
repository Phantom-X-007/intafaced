import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, postgresAvailable, type TestDatabase } from '@intafaced/db';
import { MemoryLedger, formatAmount, parseAmount, recipes, userAvailable, type Amount } from '@intafaced/ledger-client';
import { createBankServices, type BankServices } from '../bank-service.js';
import { memoryLedgerHistory } from '../analytics/ledger-history.js';
import { createBankRouter } from '../router.js';
import type { ConvertPort } from './auto-invest-service.js';

/**
 * Unit card — bank.auto-invest F-plane (wave 10 L08)
 *
 * 1. Promise: §31:805 / tracker bank.auto-invest — DCA, threshold sweeps;
 *    schedules refuse rates unset; no invent §8.
 * 2. Break: no auto-invest surface on tip; DCA would invent rates if shipped open.
 * 3. Done bar: threshold sweep moves excess → earn via ledger; DCA create refuses
 *    bank.auto_invest_rate_unset without ConvertPort; rules hold no balance.
 * 4. Class M
 * 5. Paths: services/svc-bank/**
 * 6. RED first: this suite
 * 7. Collision: claim-check clear; no open bank PRs
 */

const URL = process.env.TEST_DATABASE_URL ?? 'postgres://intafaced_ops:intafaced_ops@localhost:5433/intafaced_test';
const here = dirname(fileURLToPath(import.meta.url));
const drizzle = join(here, '../..', 'drizzle');
const migrations = readdirSync(drizzle)
  .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
  .sort()
  .map((f) => readFileSync(join(drizzle, f), 'utf8'));

const USER_A = '11111111-1111-4111-8111-111111111111';
const amt = (v: string): Amount => parseAmount(v);

const available = await postgresAvailable(URL);

if (!available) {
  describe.skip('auto-invest (Postgres unavailable)', () => {
    it('skipped', () => undefined);
  });
} else {
  const db: TestDatabase = await createTestDatabase({ service: 'bank-auto-invest', url: URL, migrations });
  const sql = db.sql;

  let ledger: MemoryLedger;
  let bank: BankServices;

  async function fund(userId: string, assetId: string, value: string) {
    await ledger.post(
      recipes.deposit({
        userId,
        assetId,
        amount: amt(value),
        rail: 'test',
        railRef: `${userId}:${assetId}:${Math.random()}`,
      }),
    );
  }

  async function accrueBankFees(assetId: string, value: string) {
    const payer = '99999999-9999-4999-8999-999999999999';
    await fund(payer, assetId, value);
    await ledger.post(
      recipes.feeCharge({
        chargeId: `bank:${Math.random()}`,
        userId: payer,
        module: 'bank',
        mode: 'asset',
        assetId,
        amount: amt(value),
      }),
    );
  }

  const availableOf = async (userId: string, assetId: string) =>
    formatAmount((await ledger.balance(userAvailable(userId, assetId))).amount);

  beforeEach(async () => {
    await sql`
      TRUNCATE bank.auto_invest_runs, bank.auto_invest_rules,
               bank.interest_accruals, bank.earn_positions, bank.earn_pools,
               bank.spaces
      RESTART IDENTITY CASCADE
    `;
    ledger = new MemoryLedger();
    bank = createBankServices(sql, ledger, memoryLedgerHistory(ledger), { nativeAssetId: 'IFC' });
  });

  afterAll(async () => {
    await db.drop();
  }, 30_000);

  describe('threshold sweep — same-asset excess to earn (no rate invent)', () => {
    it('moves only the excess above threshold into the earn pool via ledger', async () => {
      const pool = await bank.earn.createPool({
        assetId: 'USDT',
        kind: 'flexible',
        name: 'Flex',
        aprBps: 3650,
        minDeposit: amt('1'),
      });
      await accrueBankFees('USDT', '100');
      await bank.earn.fundPool({ poolId: pool.id, fundingId: 'ai-fund-1', amount: amt('100') });
      await fund(USER_A, 'USDT', '1000');

      const rule = await bank.autoInvest.createThresholdSweep({
        userId: USER_A,
        assetId: 'USDT',
        threshold: amt('400'),
        targetPoolId: pool.id,
      });
      expect(rule.kind).toBe('threshold_sweep');
      expect(rule.status).toBe('active');

      const report = await bank.autoInvest.runDue({ now: new Date('2026-08-09T12:00:00Z') });
      expect(report.settled).toBe(1);
      expect(report.failures).toEqual([]);

      // Keep 400 in primary; 600 staked.
      expect(await availableOf(USER_A, 'USDT')).toBe('400');
      expect(formatAmount(await bank.earn.stakedOf(USER_A, 'USDT'))).toBe('600');
      expect(ledger.reconcile()).toEqual({ ok: true });
    });

    it('skips when balance is at or below threshold — moves nothing', async () => {
      const pool = await bank.earn.createPool({
        assetId: 'USDT',
        kind: 'flexible',
        name: 'Flex2',
        aprBps: 3650,
      });
      await fund(USER_A, 'USDT', '50');
      await bank.autoInvest.createThresholdSweep({
        userId: USER_A,
        assetId: 'USDT',
        threshold: amt('100'),
        targetPoolId: pool.id,
      });

      const report = await bank.autoInvest.runDue({ now: new Date('2026-08-09T12:00:00Z') });
      expect(report.skipped).toBe(1);
      expect(report.settled).toBe(0);
      expect(await availableOf(USER_A, 'USDT')).toBe('50');
    });

    it('refuses a pool in a different asset rather than inventing a convert', async () => {
      const pool = await bank.earn.createPool({
        assetId: 'BTC',
        kind: 'flexible',
        name: 'BTC pool',
        aprBps: 100,
      });
      await expect(
        bank.autoInvest.createThresholdSweep({
          userId: USER_A,
          assetId: 'USDT',
          threshold: amt('10'),
          targetPoolId: pool.id,
        }),
      ).rejects.toMatchObject({ code: 'bank.asset_mismatch' });
    });

    it('refuses a non-positive threshold', async () => {
      const pool = await bank.earn.createPool({
        assetId: 'USDT',
        kind: 'flexible',
        name: 'Flex3',
        aprBps: 100,
      });
      await expect(
        bank.autoInvest.createThresholdSweep({
          userId: USER_A,
          assetId: 'USDT',
          threshold: amt('0'),
          targetPoolId: pool.id,
        }),
      ).rejects.toMatchObject({ code: 'bank.auto_invest_invalid_threshold' });
    });
  });

  describe('DCA — refuse rates unset (no invent §8)', () => {
    it('refuses createDca when no ConvertPort is configured', async () => {
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

    it('creates and fires DCA when a ConvertPort is injected (no rate invent in bank)', async () => {
      const convert: ConvertPort = {
        async convert(input) {
          // Test double: hold+settle spend, deposit buy 1:1. Production wires
          // trade.convert — rates never invented inside svc-bank.
          await ledger.post(
            recipes.withdrawHold({
              userId: input.userId,
              assetId: input.fromAsset,
              amount: input.fromAmount,
              rail: 'test-convert',
              withdrawalId: input.clientConvertId,
            }),
          );
          await ledger.post(
            recipes.withdrawSettle({
              userId: input.userId,
              assetId: input.fromAsset,
              amount: input.fromAmount,
              rail: 'test-convert',
              withdrawalId: input.clientConvertId,
            }),
          );
          await ledger.post(
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
      };

      bank = createBankServices(sql, ledger, memoryLedgerHistory(ledger), {
        nativeAssetId: 'IFC',
        autoInvest: { convert },
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
      expect(rule.kind).toBe('dca');

      const report = await bank.autoInvest.runDue({ now: new Date('2026-08-09T00:00:00Z') });
      expect(report.settled).toBe(1);
      expect(await availableOf(USER_A, 'USDT')).toBe('400');
      expect(await availableOf(USER_A, 'BTC')).toBe('100');
    });
  });

  describe('cancel + kill switch', () => {
    it('cancel stops future fires', async () => {
      const pool = await bank.earn.createPool({
        assetId: 'USDT',
        kind: 'flexible',
        name: 'C',
        aprBps: 100,
      });
      await fund(USER_A, 'USDT', '1000');
      const rule = await bank.autoInvest.createThresholdSweep({
        userId: USER_A,
        assetId: 'USDT',
        threshold: amt('100'),
        targetPoolId: pool.id,
      });
      await bank.autoInvest.cancelRule(rule.id);
      const report = await bank.autoInvest.runDue({ now: new Date() });
      expect(report.considered).toBe(0);
      expect(await availableOf(USER_A, 'USDT')).toBe('1000');
    });

    it('ops.runAutoInvest refuses when the kill switch is off', async () => {
      const { createEdgeContext, encodePrincipal, signPrincipalHeader } = await import('@intafaced/contracts');
      const SECRET = 'a-bank-auto-invest-test-edge-secret-long';
      const edgeContext = createEdgeContext({ secret: SECRET, serviceName: 'svc-bank' });
      const raw = encodePrincipal({
        sub: USER_A,
        userId: USER_A,
        sid: '22222222-2222-4222-8222-222222222222',
        scopes: ['admin:treasury'],
        tier: 'full',
        mfa: true,
        expiresAt: new Date(Date.now() + 60_000),
      } as never);
      const ctx = await edgeContext({
        headers: {
          'x-intafaced-principal': raw,
          'x-intafaced-principal-sig': signPrincipalHeader(raw, SECRET, 'DE'),
          'x-intafaced-region': 'DE',
        },
        id: 'req-ai-kill',
      });
      await expect(createBankRouter(bank, { autoInvestEnabled: false }).createCaller(ctx).ops.runAutoInvest({})).rejects.toMatchObject({
        code: 'SERVICE_UNAVAILABLE',
        cause: { code: 'bank.auto_invest_disabled' },
      });
    });
  });

  describe('doctrine — rules hold no balance', () => {
    it('auto_invest tables have no balance-shaped columns outside the allowlist shape', async () => {
      const cols = await sql<Array<{ table_name: string; column_name: string }>>`
        SELECT table_name, column_name
          FROM information_schema.columns
         WHERE table_schema = 'bank'
           AND table_name LIKE 'auto_invest%'
           AND column_name ~* '(balance|total|running|cached|available|held|accrued|outstanding)'
      `;
      expect(cols).toEqual([]);
    });
  });
}
