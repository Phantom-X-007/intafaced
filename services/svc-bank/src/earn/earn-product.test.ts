/**
 * D26-P1-B1 — bank.earn product boundary.
 *
 * Breaks caught:
 *   · an empty deployment presents an empty-but-apparently-working earn screen
 *     instead of refusing because no rate has been configured;
 *   · a late scheduler run pays a full day to a position opened after that
 *     UTC day's boundary.
 *
 * These enter through the mounted router with a signed edge principal. The
 * ledger stays real (MemoryLedger's conformance-proven implementation), and
 * every value movement uses an imported ledger-client recipe.
 */
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { createTestDatabase, postgresAvailable, type TestDatabase } from '@intafaced/db';
import { MemoryLedger, parseAmount as amount, recipes, userAvailable } from '@intafaced/ledger-client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { memoryLedgerHistory } from '../analytics/ledger-history.js';
import { createBankServices } from '../bank-service.js';
import { createBankRouter } from '../router.js';

const SECRET = 'bank-earn-product-boundary-secret-32';
const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const OPERATOR = '33333333-3333-4333-8333-333333333333';

const here = dirname(fileURLToPath(import.meta.url));
const drizzle = join(here, '..', '..', 'drizzle');
const migrations = readdirSync(drizzle)
  .filter((file) => file.endsWith('.sql') && !file.endsWith('.down.sql'))
  .sort()
  .map((file) => readFileSync(join(drizzle, file), 'utf8'));

const databaseUrl = process.env.TEST_DATABASE_URL ?? 'postgres://intafaced_ops:intafaced_ops@localhost:5433/intafaced_test';
const available = await postgresAvailable(databaseUrl);

if (!available) {
  describe.skip('D26-P1-B1 bank.earn product boundary (Postgres unavailable)', () => {
    it('skipped', () => undefined);
  });
} else {
  const db: TestDatabase = await createTestDatabase({ service: 'bank', url: databaseUrl, migrations });
  const sql = db.sql;
  const edgeContext = createEdgeContext({ secret: SECRET, serviceName: 'svc-bank' });

  afterAll(async () => {
    await db.drop();
  }, 30_000);

  function principal(userId: string, scopes: Principal['scopes']): Principal {
    return {
      sub: userId,
      userId,
      sid: randomUUID(),
      scopes,
      tier: 'full',
      mfa: true,
      expiresAt: new Date(Date.now() + 60_000),
    } as Principal;
  }

  function signedCaller(bank: ReturnType<typeof createBankServices>, actor: Principal) {
    const raw = encodePrincipal(actor);
    return createBankRouter(bank).createCaller(
      edgeContext({
        headers: {
          'x-intafaced-principal': raw,
          'x-intafaced-principal-sig': signPrincipalHeader(raw, SECRET, 'DE'),
          'x-intafaced-region': 'DE',
        },
        id: `req-${randomUUID()}`,
      }),
    );
  }

  async function fundUser(ledger: MemoryLedger, userId: string, value: string, assetId = 'USDT') {
    await ledger.post(
      recipes.deposit({
        userId,
        assetId,
        amount: amount(value),
        rail: 'test',
        railRef: `${userId}:${assetId}:${randomUUID()}`,
      }),
    );
  }

  async function fundPoolReserve(bank: ReturnType<typeof createBankServices>, ledger: MemoryLedger, poolId: string, value: string) {
    const payer = '99999999-9999-4999-8999-999999999999';
    await fundUser(ledger, payer, value);
    await ledger.post(
      recipes.feeCharge({
        chargeId: `bank-earn:${randomUUID()}`,
        userId: payer,
        module: 'bank',
        mode: 'asset',
        assetId: 'USDT',
        amount: amount(value),
      }),
    );
    await bank.earn.fundPool({ poolId, fundingId: `fund-${randomUUID()}`, amount: amount(value) });
  }

  describe('mounted earn doors', () => {
    let ledger: MemoryLedger;
    let bank: ReturnType<typeof createBankServices>;

    beforeEach(async () => {
      await sql`
        TRUNCATE bank.interest_accruals, bank.earn_positions, bank.earn_pools
        RESTART IDENTITY CASCADE
      `;
      ledger = new MemoryLedger();
      bank = createBankServices(sql, ledger, memoryLedgerHistory(ledger));
    });

    it('earn.pools refuses by name when no yield rate is configured', async () => {
      const user = signedCaller(bank, principal(USER, ['bank:read', 'bank:write']));

      await expect(user.earn.pools({})).rejects.toMatchObject({
        code: 'PRECONDITION_FAILED',
        cause: { code: 'bank.earn_rate_unset' },
      });
    });

    it('earn.pools({ assetId }) refuses by name rather than inventing a default APY', async () => {
      const user = signedCaller(bank, principal(USER, ['bank:read', 'bank:write']));

      await expect(user.earn.pools({ assetId: 'USDT' })).rejects.toMatchObject({
        code: 'PRECONDITION_FAILED',
        cause: { code: 'bank.earn_rate_unset' },
      });
    });

    it('earn.pools filters by kind in SQL and returns [] on a kind leftover miss', async () => {
      const flexible = await bank.earn.createPool({
        assetId: 'USDT',
        kind: 'flexible',
        name: 'Open flexible',
        aprBps: 1000,
      });
      const fixed = await bank.earn.createPool({
        assetId: 'USDT',
        kind: 'fixed',
        name: 'Open fixed',
        aprBps: 2000,
        termDays: 90,
      });
      const eurFixed = await bank.earn.createPool({
        assetId: 'EUR',
        kind: 'fixed',
        name: 'EUR fixed',
        aprBps: 1500,
        termDays: 30,
      });
      const closedFlexible = await bank.earn.createPool({
        assetId: 'USDT',
        kind: 'flexible',
        name: 'Closed flexible',
        aprBps: 500,
      });
      await sql`UPDATE bank.earn_pools SET status = 'closed' WHERE id = ${closedFlexible.id}::uuid`;
      const user = signedCaller(bank, principal(USER, ['bank:read', 'bank:write']));

      const unfiltered = await user.earn.pools({});
      expect(unfiltered.map((p) => p.id).sort()).toEqual([flexible.id, fixed.id, eurFixed.id].sort());
      expect(unfiltered.every((p) => p.kind === 'flexible' || p.kind === 'fixed')).toBe(true);
      expect(unfiltered.find((p) => p.id === flexible.id)?.minDeposit).toBe('0');

      expect(await user.earn.pools({ kind: 'flexible' })).toEqual([
        expect.objectContaining({ id: flexible.id, assetId: 'USDT', kind: 'flexible' }),
      ]);
      expect(await user.earn.pools({ kind: 'fixed', assetId: 'USDT' })).toEqual([
        expect.objectContaining({ id: fixed.id, assetId: 'USDT', kind: 'fixed' }),
      ]);
      expect(await user.earn.pools({ kind: 'flexible', assetId: 'EUR' })).toEqual([]);
      expect(await user.earn.pools({ kind: 'fixed', assetId: 'BTC' })).toEqual([]);
    });

    it('earn.pools({ kind }) returns [] when no open pool of that kind exists, without earn_rate_unset', async () => {
      await bank.earn.createPool({
        assetId: 'USDT',
        kind: 'flexible',
        name: 'Only flexible is open',
        aprBps: 1000,
      });
      const user = signedCaller(bank, principal(USER, ['bank:read', 'bank:write']));

      await expect(user.earn.pools({ kind: 'fixed' })).resolves.toEqual([]);
    });

    it('rejects an invalid kind at zod before the service', async () => {
      const user = signedCaller(bank, principal(USER, ['bank:read', 'bank:write']));
      const err = await user.earn.pools({ kind: 'locked' } as never).catch((e: unknown) => e);
      expect((err as { code?: string }).code).toBe('BAD_REQUEST');
    });

    it('earn.positions filters by assetId in SQL, stays active-only, and returns [] on a miss', async () => {
      const usdt = await bank.earn.createPool({
        assetId: 'USDT',
        kind: 'flexible',
        name: 'USDT flexible',
        aprBps: 1000,
      });
      const eur = await bank.earn.createPool({
        assetId: 'EUR',
        kind: 'flexible',
        name: 'EUR flexible',
        aprBps: 800,
      });
      await fundUser(ledger, USER, '1000', 'USDT');
      await fundUser(ledger, USER, '400', 'EUR');
      await fundUser(ledger, OTHER, '200', 'USDT');
      const usdtOpen = await bank.earn.deposit({ poolId: usdt.id, userId: USER, amount: amount('300') });
      const eurOpen = await bank.earn.deposit({ poolId: eur.id, userId: USER, amount: amount('150') });
      const closed = await bank.earn.deposit({ poolId: usdt.id, userId: USER, amount: amount('50') });
      await bank.earn.withdraw(closed.id);
      await sql`
        INSERT INTO bank.earn_positions (id, pool_id, user_id, asset_id, principal, opened_at, matures_at, status)
        VALUES (
          ${'cccccccc-cccc-4ccc-8ccc-cccccccccccc'},
          ${usdt.id},
          ${USER},
          'USDT',
          ${'25'}::numeric,
          ${new Date('2026-03-01T00:00:00Z')},
          ${null},
          'pending'
        )
      `;
      await bank.earn.deposit({ poolId: usdt.id, userId: OTHER, amount: amount('200') });

      const user = signedCaller(bank, principal(USER, ['bank:read', 'bank:write']));
      const omitted = await user.earn.positions({});
      expect(omitted.map((p) => p.id).sort()).toEqual([usdtOpen.id, eurOpen.id].sort());
      expect(omitted.every((p) => p.assetId === 'USDT' || p.assetId === 'EUR')).toBe(true);
      expect(omitted.find((p) => p.id === usdtOpen.id)?.principal).toBe('300');

      expect(await user.earn.positions({ assetId: 'USDT' })).toEqual([
        expect.objectContaining({ id: usdtOpen.id, assetId: 'USDT', principal: '300' }),
      ]);
      expect(await user.earn.positions({ assetId: 'BTC' })).toEqual([]);

      const stranger = signedCaller(bank, principal(OTHER, ['bank:read']));
      expect(await stranger.earn.positions({ assetId: 'USDT' })).toEqual([expect.objectContaining({ assetId: 'USDT', principal: '200' })]);
      expect(await stranger.earn.positions({})).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: usdtOpen.id })]));
    });

    it('rejects an empty or too-long assetId on earn.positions at zod before the service', async () => {
      const user = signedCaller(bank, principal(USER, ['bank:read']));
      const empty = await user.earn.positions({ assetId: '' }).catch((e: unknown) => e);
      expect((empty as { code?: string }).code).toBe('BAD_REQUEST');
      const tooLong = await user.earn.positions({ assetId: '12345678901234567' }).catch((e: unknown) => e);
      expect((tooLong as { code?: string }).code).toBe('BAD_REQUEST');
    });

    it('ops.accrueInterest refuses by name when no yield rate is configured', async () => {
      const ops = signedCaller(bank, principal(OPERATOR, ['admin:treasury']));

      await expect(ops.ops.accrueInterest({ at: '2026-03-02T23:59:59.999Z' })).rejects.toMatchObject({
        code: 'PRECONDITION_FAILED',
        cause: { code: 'bank.earn_rate_unset' },
      });
    });

    it('accrues only positions open before the UTC day boundary', async () => {
      const pool = await bank.earn.createPool({
        assetId: 'USDT',
        kind: 'flexible',
        name: 'Configured USDT',
        aprBps: 3650,
      });
      await fundPoolReserve(bank, ledger, pool.id, '100');
      await fundUser(ledger, USER, '1000');
      await bank.earn.deposit({
        poolId: pool.id,
        userId: USER,
        amount: amount('1000'),
        now: new Date('2026-03-02T00:00:00.000Z'),
      });

      const ops = signedCaller(bank, principal(OPERATOR, ['admin:treasury']));
      const sameDay = await ops.ops.accrueInterest({ poolId: pool.id, at: '2026-03-02T23:59:59.999Z' });
      expect(sameDay.results[0]).toMatchObject({
        date: '2026-03-02',
        paid: '0',
        recipients: 0,
        alreadyAccrued: false,
      });
      expect((await ledger.balance(userAvailable(USER, 'USDT'))).amount).toBe(0n);

      const nextDay = await ops.ops.accrueInterest({ poolId: pool.id, at: '2026-03-03T00:00:00.000Z' });
      expect(nextDay.results[0]).toMatchObject({
        date: '2026-03-03',
        paid: '1',
        recipients: 1,
        alreadyAccrued: false,
      });
      expect((await ledger.balance(userAvailable(USER, 'USDT'))).amount).toBe(amount('1'));
      expect(ledger.reconcile()).toEqual({ ok: true });
    });
  });
}
