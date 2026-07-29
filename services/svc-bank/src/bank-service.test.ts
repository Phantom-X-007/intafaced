import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { describe, expect, it, beforeEach, afterAll } from 'vitest';
import { issueAccessToken, verifyAccessToken } from '@intafaced/auth';
import type { Context } from '@intafaced/contracts';
import {
  MemoryLedger,
  earnPoolReserve,
  formatAmount,
  houseFees,
  parseAmount as amt,
  recipes,
  subAccountAvailable,
  userAvailable,
  userStake,
} from '@intafaced/ledger-client';
import { createBankServices, type BankServices } from './bank-service.js';
import { createBankRouter } from './router.js';
import { accountForSpace } from './spaces/space-service.js';
import { memoryLedgerHistory } from './analytics/ledger-history.js';
import { occurrenceStart, planDue, dueOccurrence } from './transfers/schedule.js';
import { dailyInterest, planAccrual } from './earn/interest.js';
import { categorise } from './analytics/spend.js';
import { BankError } from './errors.js';

/**
 * svc-bank money paths.
 *
 * The ledger here is `MemoryLedger` — the reference implementation, which the
 * conformance suite proves behaves identically to svc-ledger's Postgres engine
 * (§4.4). That equivalence is what makes it legitimate here: these tests are
 * about svc-bank's recipes, ordering and idempotency, not about the ledger.
 *
 * Postgres is real, because the claim-row / ledger interaction is exactly where
 * a double-fire bug would hide.
 *
 * The tRPC boundary is exercised at the bottom of this file rather than in a
 * `router.test.ts` of its own. That is not a stylistic preference: svc-bank's
 * SQL is schema-qualified (`bank.spaces`), so `createTestDb`'s per-suite schema
 * cannot isolate it the way it isolates svc-ledger, and two files truncating
 * the shared `bank` schema in parallel `beforeEach` hooks race each other. One
 * file per database is the shape every service here has for that reason.
 */

const URL = process.env.TEST_DATABASE_URL_BANK ?? 'postgres://svc_bank:svc_bank@localhost:5433/intafaced';
const here = dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(join(here, '..', 'drizzle', '0000_bank_init.sql'), 'utf8');
const migrationPending = readFileSync(join(here, '..', 'drizzle', '0001_position_pending.sql'), 'utf8');

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const USER_C = '33333333-3333-4333-8333-333333333333';

const DAY_MS = 24 * 60 * 60 * 1000;

async function reachable(): Promise<boolean> {
  const probe = postgres(URL, { max: 1, connect_timeout: 3, onnotice: () => undefined });
  try {
    await probe`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await probe.end({ timeout: 2 });
  }
}

const available = await reachable();

if (!available) {
  describe.skip('svc-bank (Postgres unavailable — start docker compose)', () => {
    it('skipped', () => undefined);
  });
} else {
  const sql = postgres(URL, {
    max: 8,
    connection: { search_path: 'bank,public', application_name: 'svc-bank-test' },
    onnotice: () => undefined,
  });

  await sql.unsafe(migration);
  await sql.unsafe(migrationPending);

  let ledger: MemoryLedger;
  let bank: BankServices;
  let router: ReturnType<typeof createBankRouter>;

  /** Put real value in a user's available balance, the way a deposit would. */
  async function fund(userId: string, assetId: string, value: string) {
    await ledger.post(
      recipes.deposit({ userId, assetId, amount: amt(value), rail: 'test', railRef: `${userId}:${assetId}:${Math.random()}` }),
    );
  }

  /** Accrue bank fee revenue, which is what funds an earn pool's reserve. */
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
  const stakedOf = async (userId: string, assetId: string) => {
    const all = await ledger.balances('user', userId);
    const total = all.filter((b) => b.account.kind === 'stake' && b.account.assetId === assetId).reduce((acc, b) => acc + b.amount, 0n);
    return formatAmount(total);
  };

  beforeEach(async () => {
    await sql`
      TRUNCATE bank.interest_accruals, bank.earn_positions, bank.earn_pools,
               bank.transfer_executions, bank.scheduled_transfers, bank.spaces
      RESTART IDENTITY CASCADE
    `;
    ledger = new MemoryLedger();
    bank = createBankServices(sql, ledger, memoryLedgerHistory(ledger), { nativeAssetId: 'IFC' });
    router = createBankRouter(bank);
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  // ══ Spaces ════════════════════════════════════════════════════════════════

  describe('spaces are views, not balances', () => {
    it('maps the primary space to the user own available ledger account', async () => {
      const primary = await bank.spaces.ensurePrimary(USER_A, 'USDT');
      expect(accountForSpace(primary)).toEqual(userAvailable(USER_A, 'USDT'));
    });

    it('maps a named space to its own subaccount ledger account', async () => {
      const space = await bank.spaces.create({ userId: USER_A, assetId: 'USDT', name: 'Rent' });
      expect(accountForSpace(space)).toEqual(subAccountAvailable(space.id, 'USDT'));
    });

    it('reports exactly the ledger balance for the primary space', async () => {
      const primary = await bank.spaces.ensurePrimary(USER_A, 'USDT');
      await fund(USER_A, 'USDT', '1250.5');

      const fromService = formatAmount(await bank.spaces.balanceOf(primary));
      const fromLedger = formatAmount((await ledger.balance(userAvailable(USER_A, 'USDT'))).amount);

      expect(fromService).toBe(fromLedger);
      expect(fromService).toBe('1250.5');
    });

    it('keeps only one primary space per user per asset under concurrency', async () => {
      const results = await Promise.all(Array.from({ length: 6 }, () => bank.spaces.ensurePrimary(USER_A, 'EUR')));
      const ids = new Set(results.map((s) => s.id));
      expect(ids.size).toBe(1);

      const rows = await sql`SELECT id FROM bank.spaces WHERE user_id = ${USER_A} AND asset_id = 'EUR' AND kind = 'primary'`;
      expect(rows).toHaveLength(1);
    });

    it('supports many assets for one user — the multi-currency surface', async () => {
      for (const asset of ['USDT', 'EUR', 'BTC']) {
        await bank.spaces.ensurePrimary(USER_A, asset);
        await fund(USER_A, asset, '10');
      }
      const overview = await bank.spaces.overview(USER_A);
      expect(overview.map((s) => s.assetId).sort()).toEqual(['BTC', 'EUR', 'USDT']);
      expect(overview.every((s) => s.balance === '10')).toBe(true);
    });

    it('surfaces assets the user holds but has never named', async () => {
      await bank.spaces.ensurePrimary(USER_A, 'USDT');
      await fund(USER_A, 'USDT', '5');
      await fund(USER_A, 'BTC', '0.25');

      const unnamed = await bank.spaces.unnamedAssets(USER_A);
      expect(unnamed).toEqual([{ assetId: 'BTC', balance: '0.25' }]);
    });

    it('archiving a space moves no value', async () => {
      const primary = await bank.spaces.ensurePrimary(USER_A, 'USDT');
      const pot = await bank.spaces.create({ userId: USER_A, assetId: 'USDT', name: 'Holiday' });
      await fund(USER_A, 'USDT', '100');
      await bank.transfers.transfer({ transferId: 'seed-holiday-1', fromSpaceId: primary.id, toSpaceId: pot.id, amount: amt('40') });

      await bank.spaces.archive(pot.id);

      expect(formatAmount((await ledger.balance(subAccountAvailable(pot.id, 'USDT'))).amount)).toBe('40');
      expect(ledger.totalsByAsset().USDT).toBe('0');
    });

    it('refuses to archive the primary space — it is the account itself', async () => {
      const primary = await bank.spaces.ensurePrimary(USER_A, 'USDT');
      await expect(bank.spaces.archive(primary.id)).rejects.toMatchObject({ code: 'bank.space_archived' });
    });
  });

  // ══ Transfers ═════════════════════════════════════════════════════════════

  describe('one-off transfers', () => {
    it('moves value between two spaces and the books still close', async () => {
      const primary = await bank.spaces.ensurePrimary(USER_A, 'USDT');
      const rent = await bank.spaces.create({ userId: USER_A, assetId: 'USDT', name: 'Rent' });
      await fund(USER_A, 'USDT', '1000');

      await bank.transfers.transfer({ transferId: 'transfer-rent-1', fromSpaceId: primary.id, toSpaceId: rent.id, amount: amt('250') });

      expect(await availableOf(USER_A, 'USDT')).toBe('750');
      expect(formatAmount(await bank.spaces.balanceOf(rent))).toBe('250');
      expect(ledger.totalsByAsset().USDT).toBe('0');
      expect(ledger.reconcile()).toEqual({ ok: true });
    });

    it('is idempotent on the transfer id — a retried request moves value once', async () => {
      const primary = await bank.spaces.ensurePrimary(USER_A, 'USDT');
      const rent = await bank.spaces.create({ userId: USER_A, assetId: 'USDT', name: 'Rent' });
      await fund(USER_A, 'USDT', '1000');

      const first = await bank.transfers.transfer({
        transferId: 'transfer-retry-1',
        fromSpaceId: primary.id,
        toSpaceId: rent.id,
        amount: amt('250'),
      });
      const second = await bank.transfers.transfer({
        transferId: 'transfer-retry-1',
        fromSpaceId: primary.id,
        toSpaceId: rent.id,
        amount: amt('250'),
      });

      expect(second.ledgerTxId).toBe(first.ledgerTxId);
      expect(await availableOf(USER_A, 'USDT')).toBe('750');
    });

    it('rejects a transfer with insufficient funds and moves NOTHING', async () => {
      const primary = await bank.spaces.ensurePrimary(USER_A, 'USDT');
      const rent = await bank.spaces.create({ userId: USER_A, assetId: 'USDT', name: 'Rent' });
      await fund(USER_A, 'USDT', '100');

      await expect(
        bank.transfers.transfer({ transferId: 'transfer-broke-1', fromSpaceId: primary.id, toSpaceId: rent.id, amount: amt('101') }),
      ).rejects.toMatchObject({ code: 'ledger.insufficient_funds' });

      expect(await availableOf(USER_A, 'USDT')).toBe('100');
      expect(formatAmount(await bank.spaces.balanceOf(rent))).toBe('0');
      expect(ledger.totalsByAsset().USDT).toBe('0');
      expect(ledger.reconcile()).toEqual({ ok: true });
    });

    it('refuses to change asset mid-transfer', async () => {
      const usdt = await bank.spaces.ensurePrimary(USER_A, 'USDT');
      const eur = await bank.spaces.ensurePrimary(USER_A, 'EUR');
      await fund(USER_A, 'USDT', '100');

      await expect(
        bank.transfers.transfer({ transferId: 'transfer-fx-1', fromSpaceId: usdt.id, toSpaceId: eur.id, amount: amt('10') }),
      ).rejects.toMatchObject({ code: 'bank.asset_mismatch' });

      expect(await availableOf(USER_A, 'USDT')).toBe('100');
    });

    it('refuses to debit a space the user has locked, and moves nothing', async () => {
      const primary = await bank.spaces.ensurePrimary(USER_A, 'USDT');
      const locked = await bank.spaces.create({
        userId: USER_A,
        assetId: 'USDT',
        name: 'Locked away',
        lockedUntil: new Date(Date.now() + 30 * DAY_MS),
      });
      await fund(USER_A, 'USDT', '500');
      await bank.transfers.transfer({ transferId: 'seed-locked-1', fromSpaceId: primary.id, toSpaceId: locked.id, amount: amt('200') });

      await expect(
        bank.transfers.transfer({ transferId: 'break-lock-1', fromSpaceId: locked.id, toSpaceId: primary.id, amount: amt('50') }),
      ).rejects.toMatchObject({ code: 'bank.space_locked' });

      expect(formatAmount(await bank.spaces.balanceOf(locked))).toBe('200');
      expect(await availableOf(USER_A, 'USDT')).toBe('300');
    });

    it('moves value between two different users spaces', async () => {
      const a = await bank.spaces.ensurePrimary(USER_A, 'USDT');
      const b = await bank.spaces.ensurePrimary(USER_B, 'USDT');
      await fund(USER_A, 'USDT', '80');

      await bank.transfers.transfer({ transferId: 'peer-transfer-1', fromSpaceId: a.id, toSpaceId: b.id, amount: amt('80') });

      expect(await availableOf(USER_A, 'USDT')).toBe('0');
      expect(await availableOf(USER_B, 'USDT')).toBe('80');
      expect(ledger.totalsByAsset().USDT).toBe('0');
    });
  });

  // ══ Scheduled transfers ═══════════════════════════════════════════════════

  describe('scheduled transfers', () => {
    async function standingOrder(
      value = '100',
      cadence: 'daily' | 'weekly' | 'monthly' = 'monthly',
      startsAt = new Date('2026-01-01T09:00:00Z'),
    ) {
      const primary = await bank.spaces.ensurePrimary(USER_A, 'USDT');
      const rent = await bank.spaces.create({ userId: USER_A, assetId: 'USDT', name: 'Rent' });
      const schedule = await bank.transfers.schedule({
        userId: USER_A,
        fromSpaceId: primary.id,
        toSpaceId: rent.id,
        amount: amt(value),
        cadence,
        startsAt,
      });
      return { primary, rent, schedule };
    }

    it('fires ONCE even when the job runs twice', async () => {
      const { rent, schedule } = await standingOrder('100');
      await fund(USER_A, 'USDT', '1000');

      const now = new Date('2026-01-01T10:00:00Z');
      const first = await bank.transfers.runDueTransfers({ now });
      const second = await bank.transfers.runDueTransfers({ now });

      expect(first.settled).toBe(1);
      expect(second.settled).toBe(0);

      expect(formatAmount(await bank.spaces.balanceOf(rent))).toBe('100');
      expect(await availableOf(USER_A, 'USDT')).toBe('900');

      const executions = await bank.transfers.executions(schedule.id);
      expect(executions).toHaveLength(1);
      expect(executions[0]).toMatchObject({ occurrence: 0, status: 'settled' });
    });

    it('fires once even when eight runs race each other', async () => {
      const { rent } = await standingOrder('100');
      await fund(USER_A, 'USDT', '1000');

      const now = new Date('2026-01-01T10:00:00Z');
      await Promise.all(Array.from({ length: 8 }, () => bank.transfers.runDueTransfers({ now }).catch(() => undefined)));

      expect(formatAmount(await bank.spaces.balanceOf(rent))).toBe('100');
      expect(ledger.reconcile()).toEqual({ ok: true });
    });

    it('records a rejection and moves nothing when the space is empty', async () => {
      const { rent, schedule } = await standingOrder('100');
      // No funding at all.

      const report = await bank.transfers.runDueTransfers({ now: new Date('2026-01-01T10:00:00Z') });

      expect(report.rejected).toBe(1);
      expect(report.settled).toBe(0);
      expect(formatAmount(await bank.spaces.balanceOf(rent))).toBe('0');
      expect(await availableOf(USER_A, 'USDT')).toBe('0');

      const executions = await bank.transfers.executions(schedule.id);
      expect(executions[0]).toMatchObject({ occurrence: 0, status: 'rejected', rejectionCode: 'ledger.insufficient_funds' });
      expect(ledger.totalsByAsset().USDT ?? '0').toBe('0');
    });

    it('does not retry an occurrence that was rejected — a missed March is not made up in April', async () => {
      const { rent, schedule } = await standingOrder('100', 'monthly');

      await bank.transfers.runDueTransfers({ now: new Date('2026-01-01T10:00:00Z') });
      // Money arrives afterwards; the January occurrence must stay rejected.
      await fund(USER_A, 'USDT', '1000');
      await bank.transfers.runDueTransfers({ now: new Date('2026-01-15T10:00:00Z') });

      expect(formatAmount(await bank.spaces.balanceOf(rent))).toBe('0');
      const executions = await bank.transfers.executions(schedule.id);
      expect(executions).toHaveLength(1);
      expect(executions[0]?.status).toBe('rejected');
    });

    it('fires every occurrence exactly once across a catch-up run', async () => {
      const { rent, schedule } = await standingOrder('10', 'daily', new Date('2026-01-01T00:00:00Z'));
      await fund(USER_A, 'USDT', '1000');

      // Five days later: occurrences 0..5 are all due.
      await bank.transfers.runDueTransfers({ now: new Date('2026-01-06T00:00:00Z') });
      await bank.transfers.runDueTransfers({ now: new Date('2026-01-06T00:00:00Z') });

      const executions = await bank.transfers.executions(schedule.id);
      expect(executions.map((e) => e.occurrence)).toEqual([0, 1, 2, 3, 4, 5]);
      expect(formatAmount(await bank.spaces.balanceOf(rent))).toBe('60');
    });

    it('bounds a catch-up pass so an old schedule does not fire a wall of transfers', async () => {
      const { schedule } = await standingOrder('1', 'daily', new Date('2026-01-01T00:00:00Z'));
      await fund(USER_A, 'USDT', '1000');

      await bank.transfers.runDueTransfers({ now: new Date('2026-06-01T00:00:00Z'), maxCatchUp: 3 });

      const executions = await bank.transfers.executions(schedule.id);
      expect(executions).toHaveLength(3);
    });

    it('re-drives a claim that was left pending by a crashed run, without paying twice', async () => {
      const { rent, schedule } = await standingOrder('100');
      await fund(USER_A, 'USDT', '1000');

      // Manufacture the state a process would leave if it died after committing
      // the claim but before posting. It cannot happen in the current ordering —
      // the claim and the post share a transaction — which is exactly why it is
      // worth proving the recovery path works if it ever could.
      await sql`
        INSERT INTO bank.transfer_executions (schedule_id, occurrence, amount, status)
        VALUES (${schedule.id}, 0, 100, 'pending')
      `;

      await bank.transfers.runDueTransfers({ now: new Date('2026-01-01T10:00:00Z') });
      await bank.transfers.runDueTransfers({ now: new Date('2026-01-01T10:00:00Z') });

      expect(formatAmount(await bank.spaces.balanceOf(rent))).toBe('100');
      const executions = await bank.transfers.executions(schedule.id);
      expect(executions).toHaveLength(1);
      expect(executions[0]?.status).toBe('settled');
    });

    it('stops at the end of the schedule window', async () => {
      const primary = await bank.spaces.ensurePrimary(USER_A, 'USDT');
      const rent = await bank.spaces.create({ userId: USER_A, assetId: 'USDT', name: 'Rent' });
      await fund(USER_A, 'USDT', '1000');

      const schedule = await bank.transfers.schedule({
        userId: USER_A,
        fromSpaceId: primary.id,
        toSpaceId: rent.id,
        amount: amt('10'),
        cadence: 'daily',
        startsAt: new Date('2026-01-01T00:00:00Z'),
        endsAt: new Date('2026-01-04T00:00:00Z'),
      });

      await bank.transfers.runDueTransfers({ now: new Date('2026-02-01T00:00:00Z') });

      // Occurrences 0,1,2 fall inside [starts, ends); occurrence 3 is at the
      // boundary and must not fire.
      const executions = await bank.transfers.executions(schedule.id);
      expect(executions.map((e) => e.occurrence)).toEqual([0, 1, 2]);

      const rows = await sql<Array<{ status: string }>>`SELECT status FROM bank.scheduled_transfers WHERE id = ${schedule.id}`;
      expect(rows[0]?.status).toBe('completed');
    });

    it('does not fire before the schedule starts', async () => {
      const { schedule } = await standingOrder('100', 'monthly', new Date('2026-06-01T00:00:00Z'));
      await fund(USER_A, 'USDT', '1000');

      const report = await bank.transfers.runDueTransfers({ now: new Date('2026-01-01T00:00:00Z') });
      expect(report.schedulesConsidered).toBe(0);
      expect(await bank.transfers.executions(schedule.id)).toHaveLength(0);
    });

    it('stops firing once cancelled', async () => {
      const { rent, schedule } = await standingOrder('10', 'daily', new Date('2026-01-01T00:00:00Z'));
      await fund(USER_A, 'USDT', '1000');

      await bank.transfers.runDueTransfers({ now: new Date('2026-01-01T01:00:00Z') });
      await bank.transfers.cancelSchedule(schedule.id);
      await bank.transfers.runDueTransfers({ now: new Date('2026-01-10T01:00:00Z') });

      expect(formatAmount(await bank.spaces.balanceOf(rent))).toBe('10');
    });
  });

  // ══ Earn ══════════════════════════════════════════════════════════════════

  describe('earn pools', () => {
    async function openPool(input: { apr?: number; kind?: 'flexible' | 'fixed'; termDays?: number; assetId?: string } = {}) {
      return bank.earn.createPool({
        assetId: input.assetId ?? 'USDT',
        kind: input.kind ?? 'flexible',
        name: 'Flexible USDT',
        aprBps: input.apr ?? 1000,
        termDays: input.termDays ?? null,
      });
    }

    it('moves the deposit into the ledger stake account, not into a table', async () => {
      const pool = await openPool();
      await fund(USER_A, 'USDT', '1000');

      await bank.earn.deposit({ poolId: pool.id, userId: USER_A, amount: amt('400') });

      expect(await availableOf(USER_A, 'USDT')).toBe('600');
      expect(await stakedOf(USER_A, 'USDT')).toBe('400');
      expect(ledger.totalsByAsset().USDT).toBe('0');
    });

    it('refuses a deposit larger than the user holds, and records no position', async () => {
      const pool = await openPool();
      await fund(USER_A, 'USDT', '50');

      await expect(bank.earn.deposit({ poolId: pool.id, userId: USER_A, amount: amt('500') })).rejects.toMatchObject({
        code: 'ledger.insufficient_funds',
      });

      expect(formatAmount(await bank.earn.principalOf(USER_A, 'USDT'))).toBe('0');
      expect(await stakedOf(USER_A, 'USDT')).toBe('0');
    });

    it('refuses the native asset — svc-token owns staking IFC (§8.1)', async () => {
      await expect(bank.earn.createPool({ assetId: 'IFC', kind: 'flexible', name: 'IFC pool', aprBps: 500 })).rejects.toMatchObject({
        code: 'bank.native_asset_not_earnable',
      });
    });

    it('returns the principal on withdrawal from a flexible pool', async () => {
      const pool = await openPool();
      await fund(USER_A, 'USDT', '1000');
      const position = await bank.earn.deposit({ poolId: pool.id, userId: USER_A, amount: amt('400') });

      await bank.earn.withdraw(position.id);

      expect(await availableOf(USER_A, 'USDT')).toBe('1000');
      expect(await stakedOf(USER_A, 'USDT')).toBe('0');
    });

    it('refuses to withdraw a fixed position before maturity, and moves nothing', async () => {
      const pool = await openPool({ kind: 'fixed', termDays: 90 });
      await fund(USER_A, 'USDT', '1000');
      const position = await bank.earn.deposit({ poolId: pool.id, userId: USER_A, amount: amt('400') });

      await expect(bank.earn.withdraw(position.id)).rejects.toMatchObject({ code: 'bank.position_locked' });

      expect(await stakedOf(USER_A, 'USDT')).toBe('400');
      expect(await availableOf(USER_A, 'USDT')).toBe('600');
    });

    it('allows the withdrawal once the term has elapsed', async () => {
      const pool = await openPool({ kind: 'fixed', termDays: 90 });
      await fund(USER_A, 'USDT', '1000');
      const position = await bank.earn.deposit({ poolId: pool.id, userId: USER_A, amount: amt('400') });

      await bank.earn.withdraw(position.id, new Date(Date.now() + 100 * DAY_MS));
      expect(await availableOf(USER_A, 'USDT')).toBe('1000');
    });

    it('refuses to withdraw twice — the principal is returned exactly once', async () => {
      const pool = await openPool();
      await fund(USER_A, 'USDT', '1000');
      const position = await bank.earn.deposit({ poolId: pool.id, userId: USER_A, amount: amt('400') });

      await bank.earn.withdraw(position.id);
      await expect(bank.earn.withdraw(position.id)).rejects.toMatchObject({ code: 'bank.position_closed' });

      expect(await availableOf(USER_A, 'USDT')).toBe('1000');
    });

    it('survives concurrent withdrawals without double-paying', async () => {
      const pool = await openPool();
      await fund(USER_A, 'USDT', '1000');
      const position = await bank.earn.deposit({ poolId: pool.id, userId: USER_A, amount: amt('400') });

      const results = await Promise.all(
        Array.from({ length: 8 }, () =>
          bank.earn
            .withdraw(position.id)
            .then(() => 'ok' as const)
            .catch(() => 'rejected' as const),
        ),
      );

      expect(results.filter((r) => r === 'ok')).toHaveLength(1);
      expect(await availableOf(USER_A, 'USDT')).toBe('1000');
    });

    it('enforces the minimum deposit', async () => {
      const pool = await bank.earn.createPool({
        assetId: 'USDT',
        kind: 'flexible',
        name: 'Big only',
        aprBps: 1000,
        minDeposit: amt('100'),
      });
      await fund(USER_A, 'USDT', '1000');

      await expect(bank.earn.deposit({ poolId: pool.id, userId: USER_A, amount: amt('99') })).rejects.toMatchObject({
        code: 'bank.below_minimum',
      });
      expect(await stakedOf(USER_A, 'USDT')).toBe('0');
    });

    it('computes pool size from positions, with no stored total', async () => {
      const pool = await openPool();
      for (const user of [USER_A, USER_B, USER_C]) {
        await fund(user, 'USDT', '1000');
        await bank.earn.deposit({ poolId: pool.id, userId: user, amount: amt('300') });
      }

      expect(formatAmount(await bank.earn.poolSize(pool.id))).toBe('900');

      const fromLedger = amt(await stakedOf(USER_A, 'USDT')) + amt(await stakedOf(USER_B, 'USDT')) + amt(await stakedOf(USER_C, 'USDT'));
      expect(formatAmount(fromLedger)).toBe('900');
    });
  });

  // ══ Interest accrual ══════════════════════════════════════════════════════

  describe('interest accrual', () => {
    async function fundedPool(apr = 3650) {
      // 3650 bps = 36.5% APR = 0.1% per day on a 365-day year: exact daily maths.
      const pool = await bank.earn.createPool({ assetId: 'USDT', kind: 'flexible', name: 'Flexible', aprBps: apr });
      await accrueBankFees('USDT', '10000');
      await bank.earn.fundPool({ poolId: pool.id, fundingId: 'seed-1', amount: amt('10000') });
      return pool;
    }

    it('pays a day of interest out of the pool reserve', async () => {
      const pool = await fundedPool();
      await fund(USER_A, 'USDT', '1000');
      await bank.earn.deposit({ poolId: pool.id, userId: USER_A, amount: amt('1000'), now: new Date('2026-03-01T00:00:00Z') });

      const result = await bank.earn.accrue({ poolId: pool.id, at: new Date('2026-03-02T00:00:00Z') });

      // 1000 × 3650bps ÷ 365 = 1.
      expect(formatAmount(result.paid)).toBe('1');
      expect(result.recipients).toBe(1);
      expect(await availableOf(USER_A, 'USDT')).toBe('1');
      expect(formatAmount(await bank.earn.reserveBalance(pool.id))).toBe('9999');
      expect(ledger.totalsByAsset().USDT).toBe('0');
      expect(ledger.reconcile()).toEqual({ ok: true });
    });

    it('is IDEMPOTENT per day — running the job twice pays once', async () => {
      const pool = await fundedPool();
      await fund(USER_A, 'USDT', '1000');
      await bank.earn.deposit({ poolId: pool.id, userId: USER_A, amount: amt('1000'), now: new Date('2026-03-01T00:00:00Z') });

      const at = new Date('2026-03-02T06:00:00Z');
      const first = await bank.earn.accrue({ poolId: pool.id, at });
      const second = await bank.earn.accrue({ poolId: pool.id, at: new Date('2026-03-02T23:59:00Z') });

      expect(first.alreadyAccrued).toBe(false);
      expect(second.alreadyAccrued).toBe(true);
      expect(await availableOf(USER_A, 'USDT')).toBe('1');

      const rows = await sql`SELECT id FROM bank.interest_accruals WHERE pool_id = ${pool.id}`;
      expect(rows).toHaveLength(1);
    });

    it('is idempotent per day under a concurrent double-fire', async () => {
      const pool = await fundedPool();
      await fund(USER_A, 'USDT', '1000');
      await bank.earn.deposit({ poolId: pool.id, userId: USER_A, amount: amt('1000'), now: new Date('2026-03-01T00:00:00Z') });

      const at = new Date('2026-03-02T00:00:00Z');
      await Promise.all(Array.from({ length: 6 }, () => bank.earn.accrue({ poolId: pool.id, at }).catch(() => undefined)));

      expect(await availableOf(USER_A, 'USDT')).toBe('1');
      const rows = await sql`SELECT id FROM bank.interest_accruals WHERE pool_id = ${pool.id}`;
      expect(rows).toHaveLength(1);
    });

    it('pays a different day separately', async () => {
      const pool = await fundedPool();
      await fund(USER_A, 'USDT', '1000');
      await bank.earn.deposit({ poolId: pool.id, userId: USER_A, amount: amt('1000'), now: new Date('2026-03-01T00:00:00Z') });

      await bank.earn.accrue({ poolId: pool.id, at: new Date('2026-03-02T00:00:00Z') });
      await bank.earn.accrue({ poolId: pool.id, at: new Date('2026-03-03T00:00:00Z') });

      expect(await availableOf(USER_A, 'USDT')).toBe('2');
      expect(formatAmount(await bank.earn.interestPaid(pool.id))).toBe('2');
    });

    it('refuses to accrue from an unfunded pool, and moves nothing', async () => {
      const pool = await bank.earn.createPool({ assetId: 'USDT', kind: 'flexible', name: 'Empty', aprBps: 3650 });
      await fund(USER_A, 'USDT', '1000');
      await bank.earn.deposit({ poolId: pool.id, userId: USER_A, amount: amt('1000'), now: new Date('2026-03-01T00:00:00Z') });

      await expect(bank.earn.accrue({ poolId: pool.id, at: new Date('2026-03-02T00:00:00Z') })).rejects.toMatchObject({
        code: 'bank.pool_underfunded',
      });

      expect(await availableOf(USER_A, 'USDT')).toBe('0');
      // And the day is NOT consumed — funding the pool must let it be re-run.
      const rows = await sql`SELECT id FROM bank.interest_accruals WHERE pool_id = ${pool.id}`;
      expect(rows).toHaveLength(0);

      await accrueBankFees('USDT', '100');
      await bank.earn.fundPool({ poolId: pool.id, fundingId: 'rescue-1', amount: amt('100') });
      const rescued = await bank.earn.accrue({ poolId: pool.id, at: new Date('2026-03-02T00:00:00Z') });
      expect(formatAmount(rescued.paid)).toBe('1');
    });

    it('does not pay interest on a position opened after the accrual moment', async () => {
      const pool = await fundedPool();
      await fund(USER_A, 'USDT', '1000');
      await bank.earn.deposit({ poolId: pool.id, userId: USER_A, amount: amt('1000'), now: new Date('2026-03-05T00:00:00Z') });

      const result = await bank.earn.accrue({ poolId: pool.id, at: new Date('2026-03-02T00:00:00Z') });
      expect(result.recipients).toBe(0);
      expect(formatAmount(result.paid)).toBe('0');
      expect(await availableOf(USER_A, 'USDT')).toBe('0');
    });

    it('pays one credit per user regardless of how many positions they hold', async () => {
      const pool = await fundedPool();
      await fund(USER_A, 'USDT', '3000');
      const opened = new Date('2026-03-01T00:00:00Z');
      await bank.earn.deposit({ poolId: pool.id, userId: USER_A, amount: amt('1000'), now: opened });
      await bank.earn.deposit({ poolId: pool.id, userId: USER_A, amount: amt('1000'), now: opened });

      const result = await bank.earn.accrue({ poolId: pool.id, at: new Date('2026-03-02T00:00:00Z') });
      expect(result.recipients).toBe(1);
      // Two positions of 1000 at 0.1%/day = 2 interest, on top of the 1000 the
      // user did not deposit.
      expect(formatAmount(result.paid)).toBe('2');
      expect(await availableOf(USER_A, 'USDT')).toBe('1002');
    });

    it('records a zero-interest day rather than reconsidering it forever', async () => {
      const pool = await fundedPool();
      const result = await bank.earn.accrue({ poolId: pool.id, at: new Date('2026-03-02T00:00:00Z') });

      expect(result.recipients).toBe(0);
      expect(result.ledgerTxId).toBeNull();
      const rows = await sql`SELECT id FROM bank.interest_accruals WHERE pool_id = ${pool.id}`;
      expect(rows).toHaveLength(1);
    });

    it('leaves the interest in available, never in the principal', async () => {
      const pool = await fundedPool();
      await fund(USER_A, 'USDT', '1000');
      const position = await bank.earn.deposit({
        poolId: pool.id,
        userId: USER_A,
        amount: amt('1000'),
        now: new Date('2026-03-01T00:00:00Z'),
      });

      const before = await sql<Array<{ principal: string }>>`SELECT principal FROM bank.earn_positions WHERE id = ${position.id}`;
      await bank.earn.accrue({ poolId: pool.id, at: new Date('2026-03-02T00:00:00Z') });
      const after = await sql<Array<{ principal: string }>>`SELECT principal FROM bank.earn_positions WHERE id = ${position.id}`;

      expect(after[0]!.principal).toBe(before[0]!.principal);
      expect(await stakedOf(USER_A, 'USDT')).toBe('1000');
      expect(await availableOf(USER_A, 'USDT')).toBe('1');
    });
  });

  // ══ Spend analytics ═══════════════════════════════════════════════════════

  describe('spend analytics are computed, not accumulated', () => {
    it('buckets outflows by ledger reason code', async () => {
      const primary = await bank.spaces.ensurePrimary(USER_A, 'USDT');
      const rent = await bank.spaces.create({ userId: USER_A, assetId: 'USDT', name: 'Rent' });
      await fund(USER_A, 'USDT', '1000');

      await bank.transfers.transfer({ transferId: 'analytics-1', fromSpaceId: primary.id, toSpaceId: rent.id, amount: amt('200') });
      await ledger.post(
        recipes.feeCharge({
          chargeId: 'analytics-fee-1',
          userId: USER_A,
          module: 'bank',
          mode: 'asset',
          assetId: 'USDT',
          amount: amt('5'),
        }),
      );

      const summary = await bank.analytics.spendSummary({
        userId: USER_A,
        assetId: 'USDT',
        range: { from: new Date(Date.now() - DAY_MS), to: new Date(Date.now() + DAY_MS) },
      });

      expect(summary.outflowByCategory.fees).toBe('5');
      // The transfer left the primary space AND arrived in the named one, so it
      // shows as an outflow of 200 with a matching inflow — moving your own
      // money between your own pots is not spending it.
      expect(summary.outflowByCategory.transfers).toBe('200');
      expect(summary.totalOutflow).toBe('205');
      expect(summary.totalInflow).toBe('1200');
    });

    it('reports nothing outside the window', async () => {
      const primary = await bank.spaces.ensurePrimary(USER_A, 'USDT');
      const rent = await bank.spaces.create({ userId: USER_A, assetId: 'USDT', name: 'Rent' });
      await fund(USER_A, 'USDT', '1000');
      await bank.transfers.transfer({ transferId: 'analytics-2', fromSpaceId: primary.id, toSpaceId: rent.id, amount: amt('200') });

      const summary = await bank.analytics.spendSummary({
        userId: USER_A,
        assetId: 'USDT',
        range: { from: new Date('2020-01-01T00:00:00Z'), to: new Date('2020-02-01T00:00:00Z') },
      });

      expect(summary.movements).toBe(0);
      expect(summary.totalOutflow).toBe('0');
    });

    it('gives the same answer twice — nothing is consumed by asking', async () => {
      const primary = await bank.spaces.ensurePrimary(USER_A, 'USDT');
      const rent = await bank.spaces.create({ userId: USER_A, assetId: 'USDT', name: 'Rent' });
      await fund(USER_A, 'USDT', '1000');
      await bank.transfers.transfer({ transferId: 'analytics-3', fromSpaceId: primary.id, toSpaceId: rent.id, amount: amt('123.456') });

      const range = { from: new Date(Date.now() - DAY_MS), to: new Date(Date.now() + DAY_MS) };
      const first = await bank.analytics.spendSummary({ userId: USER_A, assetId: 'USDT', range });
      const second = await bank.analytics.spendSummary({ userId: USER_A, assetId: 'USDT', range });

      expect(second).toEqual(first);
    });
  });

  // ══ The whole book, after a mixed run ═════════════════════════════════════

  describe('the books close after a mixed run', () => {
    it('totalsByAsset is zero and reconcile is clean', async () => {
      const primaryA = await bank.spaces.ensurePrimary(USER_A, 'USDT');
      const rent = await bank.spaces.create({ userId: USER_A, assetId: 'USDT', name: 'Rent' });
      const primaryB = await bank.spaces.ensurePrimary(USER_B, 'USDT');
      await bank.spaces.ensurePrimary(USER_C, 'EUR');

      await fund(USER_A, 'USDT', '5000');
      await fund(USER_B, 'USDT', '2000');
      await fund(USER_C, 'EUR', '900');

      // A one-off transfer, a peer transfer, a standing order that fires and one
      // that cannot, an earn deposit, a withdrawal, and two days of interest.
      await bank.transfers.transfer({ transferId: 'mixed-1', fromSpaceId: primaryA.id, toSpaceId: rent.id, amount: amt('750') });
      await bank.transfers.transfer({ transferId: 'mixed-2', fromSpaceId: primaryA.id, toSpaceId: primaryB.id, amount: amt('250') });

      const good = await bank.transfers.schedule({
        userId: USER_A,
        fromSpaceId: primaryA.id,
        toSpaceId: rent.id,
        amount: amt('100'),
        cadence: 'daily',
        startsAt: new Date('2026-01-01T00:00:00Z'),
      });
      const doomed = await bank.transfers.schedule({
        userId: USER_C,
        fromSpaceId: (await bank.spaces.ensurePrimary(USER_C, 'EUR')).id,
        toSpaceId: (await bank.spaces.create({ userId: USER_C, assetId: 'EUR', name: 'Nope' })).id,
        amount: amt('100000'),
        cadence: 'daily',
        startsAt: new Date('2026-01-01T00:00:00Z'),
      });

      await bank.transfers.runDueTransfers({ now: new Date('2026-01-03T00:00:00Z') });

      const pool = await bank.earn.createPool({ assetId: 'USDT', kind: 'flexible', name: 'Flexible', aprBps: 3650 });
      await accrueBankFees('USDT', '500');
      await bank.earn.fundPool({ poolId: pool.id, fundingId: 'mixed-seed', amount: amt('500') });

      await bank.earn.deposit({ poolId: pool.id, userId: USER_B, amount: amt('2000'), now: new Date('2026-01-01T00:00:00Z') });
      await bank.earn.accrue({ poolId: pool.id, at: new Date('2026-01-02T00:00:00Z') });
      await bank.earn.accrue({ poolId: pool.id, at: new Date('2026-01-03T00:00:00Z') });

      const positions = await bank.earn.positionsOf(USER_B);
      await bank.earn.withdraw(positions[0]!.id);

      // Every asset in the book nets to zero: nothing was created or destroyed.
      const totals = ledger.totalsByAsset();
      for (const [asset, total] of Object.entries(totals)) {
        expect(`${asset}=${total}`).toBe(`${asset}=0`);
      }
      expect(ledger.reconcile()).toEqual({ ok: true });
      expect(ledger.verifyChain()).toEqual({ ok: true });

      // And the doomed schedule moved nothing.
      const doomedExecutions = await bank.transfers.executions(doomed.id);
      expect(doomedExecutions.every((e) => e.status === 'rejected')).toBe(true);
      expect(await availableOf(USER_C, 'EUR')).toBe('900');

      const goodExecutions = await bank.transfers.executions(good.id);
      expect(goodExecutions.filter((e) => e.status === 'settled').length).toBeGreaterThan(0);
    });
  });

  // ══ DOCTRINE §0.6 — enforced from inside ══════════════════════════════════

  describe('doctrine §0.6 — no balance outside the ledger', () => {
    it("a space's reported balance ALWAYS equals the ledger's, across every space and asset", async () => {
      const primaryUsdt = await bank.spaces.ensurePrimary(USER_A, 'USDT');
      const rent = await bank.spaces.create({ userId: USER_A, assetId: 'USDT', name: 'Rent' });
      const holiday = await bank.spaces.create({ userId: USER_A, assetId: 'USDT', name: 'Holiday' });
      const primaryEur = await bank.spaces.ensurePrimary(USER_A, 'EUR');

      await fund(USER_A, 'USDT', '1234.567891');
      await fund(USER_A, 'EUR', '99.5');
      await bank.transfers.transfer({ transferId: 'doctrine-1', fromSpaceId: primaryUsdt.id, toSpaceId: rent.id, amount: amt('400.1') });
      await bank.transfers.transfer({
        transferId: 'doctrine-2',
        fromSpaceId: primaryUsdt.id,
        toSpaceId: holiday.id,
        amount: amt('0.000001'),
      });

      // THE assertion. Two independent answers to "how much is in this space" —
      // the one svc-bank reports, and the one the book holds — for every space.
      for (const space of [primaryUsdt, rent, holiday, primaryEur]) {
        const fromService = formatAmount(await bank.spaces.balanceOf(space));
        const fromLedger = formatAmount((await ledger.balance(accountForSpace(space))).amount);
        expect(`${space.name}:${fromService}`).toBe(`${space.name}:${fromLedger}`);
      }

      // And the user's USDT spaces sum to exactly what was deposited: no space
      // invented or lost a unit of the user's money.
      const usdtTotal =
        (await bank.spaces.balanceOf(primaryUsdt)) + (await bank.spaces.balanceOf(rent)) + (await bank.spaces.balanceOf(holiday));
      expect(formatAmount(usdtTotal)).toBe('1234.567891');
    });

    it('earn principal in this table always equals the ledger stake account', async () => {
      const pool = await bank.earn.createPool({ assetId: 'USDT', kind: 'flexible', name: 'Flexible', aprBps: 1000 });
      const fixed = await bank.earn.createPool({ assetId: 'USDT', kind: 'fixed', name: 'Fixed 90', aprBps: 2000, termDays: 90 });

      await fund(USER_A, 'USDT', '10000');
      await fund(USER_B, 'USDT', '5000');
      await bank.earn.deposit({ poolId: pool.id, userId: USER_A, amount: amt('4000') });
      await bank.earn.deposit({ poolId: fixed.id, userId: USER_A, amount: amt('1000') });
      await bank.earn.deposit({ poolId: pool.id, userId: USER_B, amount: amt('5000') });

      // The two independent answers to "how much is earning" must agree. That
      // they CAN be compared is the point of keeping value in the ledger and
      // only terms here.
      for (const user of [USER_A, USER_B]) {
        const fromTable = formatAmount(await bank.earn.principalOf(user, 'USDT'));
        const fromLedger = formatAmount(await bank.earn.stakedOf(user, 'USDT'));
        expect(`${user}:${fromTable}`).toBe(`${user}:${fromLedger}`);
      }

      expect(formatAmount(await bank.earn.principalOf(USER_A, 'USDT'))).toBe('5000');
    });

    it('interest recorded per day always equals what left the pool reserve', async () => {
      const pool = await bank.earn.createPool({ assetId: 'USDT', kind: 'flexible', name: 'Flexible', aprBps: 3650 });
      await accrueBankFees('USDT', '1000');
      await bank.earn.fundPool({ poolId: pool.id, fundingId: 'audit-1', amount: amt('1000') });

      await fund(USER_A, 'USDT', '5000');
      await bank.earn.deposit({ poolId: pool.id, userId: USER_A, amount: amt('5000'), now: new Date('2026-04-01T00:00:00Z') });

      for (const day of ['2026-04-02', '2026-04-03', '2026-04-04']) {
        await bank.earn.accrue({ poolId: pool.id, at: new Date(`${day}T00:00:00Z`) });
      }

      const fromTable = await bank.earn.interestPaid(pool.id);
      const reserveNow = (await ledger.balance(earnPoolReserve(pool.id, 'USDT'))).amount;
      const paidOut = amt('1000') - reserveNow;

      expect(formatAmount(fromTable)).toBe(formatAmount(paidOut));
      expect(formatAmount(fromTable)).toBe('15');
    });

    /**
     * THE SCHEMA GUARD.
     *
     * Every check above proves the service currently agrees with the ledger.
     * This one proves it CANNOT quietly stop: it reads the live schema and
     * fails on any column whose name suggests an accumulating figure, and on
     * any money-typed column that is not on an explicit, reasoned allowlist.
     *
     * The point is that adding `spaces.balance` — the single most tempting
     * change anyone will ever propose to this service — turns a green build
     * red, with the doctrine quoted in the failure.
     */
    it('has NO balance-like column anywhere in the bank schema', async () => {
      const columns = await sql<Array<{ table_name: string; column_name: string; data_type: string; numeric_precision: number | null }>>`
        SELECT table_name, column_name, data_type, numeric_precision
          FROM information_schema.columns
         WHERE table_schema = 'bank' AND table_name <> '__migrations'
         ORDER BY table_name, column_name
      `;

      expect(columns.length).toBeGreaterThan(0);

      // Names that describe an accumulating figure — a second source of truth
      // for money by any other name.
      const FORBIDDEN = [
        /balance/i,
        /(^|_)total($|_)/i,
        /running/i,
        /cached/i,
        /(^|_)available($|_)/i,
        /(^|_)held($|_)/i,
        /holdings/i,
        /accrued/i,
        /accumulat/i,
        /(^|_)sum($|_)/i,
        /funds/i,
        /equity/i,
        /net_worth/i,
        /outstanding/i,
      ];

      const offenders = columns.filter((c) => FORBIDDEN.some((p) => p.test(c.column_name))).map((c) => `${c.table_name}.${c.column_name}`);

      expect(
        offenders,
        `Doctrine §0.6: "No module holds its own balance." §8.1: "no new balance system — views + rails". ` +
          `These columns read as running totals: ${offenders.join(', ')}`,
      ).toEqual([]);

      /**
       * Every money-typed column, with the reason it is not a balance. A new
       * numeric(38,18) column fails here until someone writes down which of the
       * three legitimate kinds it is: a policy limit, a goal, an instruction, or
       * a record of one completed event.
       */
      const MONEY_COLUMNS: Record<string, string> = {
        'spaces.goal_target': 'a savings TARGET the user set — never written by a money path',
        'scheduled_transfers.amount': 'the INSTRUCTION; immutable after insert',
        'transfer_executions.amount': 'a RECORD of one completed firing; written once',
        'earn_pools.min_deposit': 'a POLICY floor on a single deposit',
        'earn_positions.principal': 'the deposit RECORD; interest is paid to available, never added here',
        'interest_accruals.paid_amount': 'a RECORD of one day; summing the table is the lifetime figure',
      };

      const moneyColumns = columns
        .filter((c) => c.data_type === 'numeric' && c.numeric_precision === 38)
        .map((c) => `${c.table_name}.${c.column_name}`);

      const undeclared = moneyColumns.filter((c) => !(c in MONEY_COLUMNS));
      expect(
        undeclared,
        `Every money column in svc-bank must be a policy limit, a goal, an instruction, or a record of a ` +
          `completed event — never a running figure. Undeclared: ${undeclared.join(', ')}`,
      ).toEqual([]);

      // And the allowlist must not rot: a declared column that no longer exists
      // means the reasoning above is stale.
      const missing = Object.keys(MONEY_COLUMNS).filter((c) => !moneyColumns.includes(c));
      expect(missing).toEqual([]);
    });

    it('never writes to a money column after the row is created', async () => {
      // Behavioural proof of the same rule: run every money path this service
      // has, then confirm not one of the recorded figures changed.
      const primary = await bank.spaces.ensurePrimary(USER_A, 'USDT');
      const rent = await bank.spaces.create({ userId: USER_A, assetId: 'USDT', name: 'Rent', goalTarget: amt('5000') });
      await fund(USER_A, 'USDT', '10000');

      const schedule = await bank.transfers.schedule({
        userId: USER_A,
        fromSpaceId: primary.id,
        toSpaceId: rent.id,
        amount: amt('100'),
        cadence: 'daily',
        startsAt: new Date('2026-01-01T00:00:00Z'),
      });

      const pool = await bank.earn.createPool({ assetId: 'USDT', kind: 'flexible', name: 'Flexible', aprBps: 3650 });
      await accrueBankFees('USDT', '1000');
      await bank.earn.fundPool({ poolId: pool.id, fundingId: 'immutable-1', amount: amt('1000') });
      const position = await bank.earn.deposit({
        poolId: pool.id,
        userId: USER_A,
        amount: amt('1000'),
        now: new Date('2026-01-01T00:00:00Z'),
      });

      const snapshot = async () => ({
        goal: (await sql<Array<{ goal_target: string }>>`SELECT goal_target FROM bank.spaces WHERE id = ${rent.id}`)[0]!.goal_target,
        instruction: (await sql<Array<{ amount: string }>>`SELECT amount FROM bank.scheduled_transfers WHERE id = ${schedule.id}`)[0]!
          .amount,
        minDeposit: (await sql<Array<{ min_deposit: string }>>`SELECT min_deposit FROM bank.earn_pools WHERE id = ${pool.id}`)[0]!
          .min_deposit,
        principal: (await sql<Array<{ principal: string }>>`SELECT principal FROM bank.earn_positions WHERE id = ${position.id}`)[0]!
          .principal,
      });

      const before = await snapshot();

      await bank.transfers.runDueTransfers({ now: new Date('2026-01-04T00:00:00Z') });
      await bank.earn.accrue({ poolId: pool.id, at: new Date('2026-01-02T00:00:00Z') });
      await bank.earn.accrue({ poolId: pool.id, at: new Date('2026-01-03T00:00:00Z') });
      await bank.transfers.transfer({ transferId: 'immutable-move-1', fromSpaceId: primary.id, toSpaceId: rent.id, amount: amt('50') });

      expect(await snapshot()).toEqual(before);
    });
  });

  // ══ Pure functions ════════════════════════════════════════════════════════

  describe('schedule arithmetic', () => {
    const anchor = new Date('2026-01-31T09:00:00Z');

    it('clamps monthly occurrences into short months and returns to the anchor day', () => {
      expect(occurrenceStart(anchor, 'monthly', 0).toISOString()).toBe('2026-01-31T09:00:00.000Z');
      // February has 28 days in 2026 — clamped, not rolled into March.
      expect(occurrenceStart(anchor, 'monthly', 1).toISOString()).toBe('2026-02-28T09:00:00.000Z');
      // And back to the 31st, because every occurrence is computed from the anchor.
      expect(occurrenceStart(anchor, 'monthly', 2).toISOString()).toBe('2026-03-31T09:00:00.000Z');
      expect(occurrenceStart(anchor, 'monthly', 3).toISOString()).toBe('2026-04-30T09:00:00.000Z');
    });

    it('crosses a year boundary', () => {
      expect(occurrenceStart(new Date('2026-11-15T00:00:00Z'), 'monthly', 3).toISOString()).toBe('2027-02-15T00:00:00.000Z');
    });

    it('computes daily and weekly occurrences arithmetically', () => {
      const start = new Date('2026-01-01T00:00:00Z');
      expect(occurrenceStart(start, 'daily', 10).toISOString()).toBe('2026-01-11T00:00:00.000Z');
      expect(occurrenceStart(start, 'weekly', 2).toISOString()).toBe('2026-01-15T00:00:00.000Z');
    });

    it('inverts cleanly: the due occurrence is the one that has started', () => {
      const start = new Date('2026-01-31T09:00:00Z');
      expect(dueOccurrence(start, 'monthly', new Date('2026-01-31T08:59:59Z'))).toBeNull();
      expect(dueOccurrence(start, 'monthly', new Date('2026-01-31T09:00:00Z'))).toBe(0);
      expect(dueOccurrence(start, 'monthly', new Date('2026-02-27T09:00:00Z'))).toBe(0);
      expect(dueOccurrence(start, 'monthly', new Date('2026-02-28T09:00:00Z'))).toBe(1);
      expect(dueOccurrence(start, 'monthly', new Date('2026-03-31T09:00:00Z'))).toBe(2);
    });

    it('never re-plans an occurrence that already fired', () => {
      const start = new Date('2026-01-01T00:00:00Z');
      const plan = planDue({ startsAt: start, cadence: 'daily', endsAt: null, lastFired: 3, now: new Date('2026-01-06T00:00:00Z') });
      expect(plan.occurrences).toEqual([4, 5]);
    });

    it('plans nothing when everything due has fired', () => {
      const start = new Date('2026-01-01T00:00:00Z');
      const plan = planDue({ startsAt: start, cadence: 'daily', endsAt: null, lastFired: 5, now: new Date('2026-01-06T00:00:00Z') });
      expect(plan.occurrences).toEqual([]);
      expect(plan.completed).toBe(false);
    });

    it('marks a schedule completed once its window closes', () => {
      const start = new Date('2026-01-01T00:00:00Z');
      const plan = planDue({
        startsAt: start,
        cadence: 'daily',
        endsAt: new Date('2026-01-04T00:00:00Z'),
        lastFired: null,
        now: new Date('2026-03-01T00:00:00Z'),
      });
      expect(plan.occurrences).toEqual([0, 1, 2]);
      expect(plan.completed).toBe(true);
    });
  });

  describe('interest arithmetic', () => {
    it('rounds a day of interest DOWN, never up', () => {
      // One unit of precision at 1 bps a year is far below a day's resolution:
      // it floors to nothing rather than inventing a unit the reserve must find.
      expect(dailyInterest(amt('0.000000000000000001'), 1)).toBe(0n);
      // 365 units at 10000 bps (100%) = exactly 1 a day.
      expect(formatAmount(dailyInterest(amt('365'), 10_000))).toBe('1');
      // A rate that does not divide evenly floors rather than rounds up:
      // 100 × 10% ÷ 365 = 0.027397260273972602739…, truncated at 18dp.
      expect(formatAmount(dailyInterest(amt('100'), 1000))).toBe('0.027397260273972602');
    });

    it('pays nothing on a zero rate or a closed position', () => {
      expect(dailyInterest(amt('1000'), 0)).toBe(0n);
      expect(dailyInterest(0n, 5000)).toBe(0n);
    });

    it('rejects a negative rate rather than paying a fee dressed as yield', () => {
      expect(() => dailyInterest(amt('1000'), -100)).toThrow(RangeError);
    });

    it('aggregates per user and counts dust rather than dropping it silently', () => {
      const plan = planAccrual(
        [
          { positionId: 'p1', userId: USER_A, principal: amt('365') },
          { positionId: 'p2', userId: USER_A, principal: amt('365') },
          { positionId: 'p3', userId: USER_B, principal: amt('0.000000000000000001') },
        ],
        10_000,
      );

      expect(plan.payouts).toHaveLength(1);
      expect(plan.payouts[0]?.userId).toBe(USER_A);
      expect(formatAmount(plan.payouts[0]!.amount)).toBe('2');
      expect(plan.dust).toBe(1);
      expect(formatAmount(plan.total)).toBe('2');
    });

    it('produces a deterministic entry order', () => {
      const positions = [
        { positionId: 'p1', userId: USER_C, principal: amt('365') },
        { positionId: 'p2', userId: USER_A, principal: amt('365') },
        { positionId: 'p3', userId: USER_B, principal: amt('365') },
      ];
      const first = planAccrual(positions, 10_000).payouts.map((p) => p.userId);
      const second = planAccrual([...positions].reverse(), 10_000).payouts.map((p) => p.userId);
      expect(first).toEqual(second);
      expect(first).toEqual([USER_A, USER_B, USER_C]);
    });
  });

  describe('spend categorisation', () => {
    it('maps ledger reason codes to product categories', () => {
      expect(categorise('bank.transfer.scheduled')).toBe('transfers');
      expect(categorise('bank.earn.deposited')).toBe('earn');
      expect(categorise('trade.fill')).toBe('trading');
      expect(categorise('p2p.escrow.lock')).toBe('p2p');
      expect(categorise('fee.charged')).toBe('fees');
      expect(categorise('withdraw.settled')).toBe('withdrawals');
      expect(categorise('deposit.credited')).toBe('rewards');
    });

    it('never drops an unknown reason', () => {
      expect(categorise('something.nobody.has.written.yet')).toBe('other');
    });
  });

  describe('recipe guards', () => {
    it('refuses a transfer that would change asset', () => {
      expect(() =>
        recipes.bankTransfer({
          transferId: 'guard-1',
          occurrence: 0,
          from: userAvailable(USER_A, 'USDT'),
          to: userAvailable(USER_B, 'EUR'),
          amount: amt('1'),
          kind: 'manual',
        }),
      ).toThrow(/cannot change asset/i);
    });

    it('refuses a transfer into a locked account kind', () => {
      expect(() =>
        recipes.bankTransfer({
          transferId: 'guard-2',
          occurrence: 0,
          from: userAvailable(USER_A, 'USDT'),
          to: userStake(USER_A, 'USDT', 'bank:earn:guard'),
          amount: amt('1'),
          kind: 'manual',
        }),
      ).toThrow(/available accounts only/i);
    });

    it('refuses a transfer to the same account', () => {
      expect(() =>
        recipes.bankTransfer({
          transferId: 'guard-3',
          occurrence: 0,
          from: userAvailable(USER_A, 'USDT'),
          to: userAvailable(USER_A, 'USDT'),
          amount: amt('1'),
          kind: 'manual',
        }),
      ).toThrow(/two different accounts/i);
    });

    it('derives the same idempotency key from the same (schedule, occurrence)', () => {
      const build = () =>
        recipes.bankTransfer({
          transferId: 'sched-x',
          occurrence: 7,
          from: userAvailable(USER_A, 'USDT'),
          to: userAvailable(USER_B, 'USDT'),
          amount: amt('1'),
          kind: 'scheduled',
        }).idempotencyKey;
      expect(build()).toBe('bank.transfer:sched-x:7');
      expect(build()).toBe(build());
    });

    it('derives the interest key from (pool, date)', () => {
      const request = recipes.earnInterest({
        poolId: 'pool-x',
        date: '2026-04-01',
        assetId: 'USDT',
        payouts: [{ userId: USER_A, amount: amt('1') }],
      });
      expect(request.idempotencyKey).toBe('bank.interest:pool-x:2026-04-01');
    });

    it('refuses an accrual date that is not a day', () => {
      expect(() =>
        recipes.earnInterest({
          poolId: 'pool-x',
          date: '2026-04-01T00:00:00Z',
          assetId: 'USDT',
          payouts: [{ userId: USER_A, amount: amt('1') }],
        }),
      ).toThrow(/YYYY-MM-DD/);
    });

    it('funds a pool reserve out of bank fee revenue, and the books close', async () => {
      await accrueBankFees('USDT', '250');
      expect(formatAmount((await ledger.balance(houseFees('bank', 'USDT'))).amount)).toBe('250');

      const pool = await bank.earn.createPool({ assetId: 'USDT', kind: 'flexible', name: 'Flexible', aprBps: 500 });
      await bank.earn.fundPool({ poolId: pool.id, fundingId: 'guard-fund-1', amount: amt('250') });

      expect(formatAmount((await ledger.balance(houseFees('bank', 'USDT'))).amount)).toBe('0');
      expect(formatAmount(await bank.earn.reserveBalance(pool.id))).toBe('250');
      expect(ledger.totalsByAsset().USDT).toBe('0');
    });

    it('refuses to fund a pool reserve out of revenue that does not exist', async () => {
      const pool = await bank.earn.createPool({ assetId: 'USDT', kind: 'flexible', name: 'Flexible', aprBps: 500 });
      await expect(bank.earn.fundPool({ poolId: pool.id, fundingId: 'guard-fund-2', amount: amt('1') })).rejects.toMatchObject({
        code: 'ledger.insufficient_funds',
      });
      expect(formatAmount(await bank.earn.reserveBalance(pool.id))).toBe('0');
    });
  });

  describe('lookup failures', () => {
    it('reports an unknown space rather than guessing', async () => {
      await expect(bank.spaces.get('44444444-4444-4444-8444-444444444444')).rejects.toBeInstanceOf(BankError);
    });

    it('reports an unknown pool and an unknown position', async () => {
      await expect(bank.earn.pool('44444444-4444-4444-8444-444444444444')).rejects.toMatchObject({ code: 'bank.pool_not_found' });
      await expect(bank.earn.position('44444444-4444-4444-8444-444444444444')).rejects.toMatchObject({
        code: 'bank.position_not_found',
      });
    });

    it('refuses to cancel a schedule that is not active', async () => {
      await expect(bank.transfers.cancelSchedule('44444444-4444-4444-8444-444444444444')).rejects.toMatchObject({
        code: 'bank.schedule_inactive',
      });
    });
  });

  // ══ The tRPC boundary: whose row, not just what kind ══════════════════════

  /**
   * A scope answers "may this principal do this KIND of thing". It has never
   * answered "may they do it to THIS row", and `bank:read` / `bank:write` are
   * held by every user on the platform.
   *
   * Both callers below clear every guard svc-bank declares — scope, `full`
   * verification, a region the matrix allows. That is the point: clearing all
   * of them was still enough to reach another user's standing order.
   */
  const authConfig = {
    secret: 'a-test-signing-secret-that-is-long-enough',
    issuer: 'intafaced',
    audience: 'intafaced.api',
    accessTtlSeconds: 900,
  };

  async function ctx(userId: string, scopes: string[]): Promise<Context> {
    const { token } = await issueAccessToken(
      { userId, sessionId: '77777777-7777-4777-8777-777777777777', scopes, tier: 'full', mfa: true },
      authConfig,
    );
    return { principal: await verifyAccessToken(token, authConfig), service: null, region: 'DE', requestId: 'req-1' };
  }

  const caller = async (userId: string, scopes: string[]) => router.createCaller(await ctx(userId, scopes));
  const codeOf = (err: unknown) => (err as { code?: string }).code;

  /** A standing order owned by `userId`, with one occurrence already fired. */
  async function firedStandingOrder(userId: string) {
    const primary = await bank.spaces.ensurePrimary(userId, 'USDT');
    const rent = await bank.spaces.create({ userId, assetId: 'USDT', name: 'Rent' });
    await fund(userId, 'USDT', '1000');

    const schedule = await bank.transfers.schedule({
      userId,
      fromSpaceId: primary.id,
      toSpaceId: rent.id,
      amount: amt('100'),
      cadence: 'monthly',
      startsAt: new Date('2026-01-01T09:00:00Z'),
    });

    // Fire it, so `executions` has something worth stealing: an amount, a
    // status and a ledger transaction id.
    await bank.transfers.runDueTransfers({ now: new Date('2026-01-01T10:00:00Z') });
    return schedule;
  }

  describe('transfers.executions is not readable by another user', () => {
    it('refuses user B the firing history of user A’s standing order', async () => {
      const schedule = await firedStandingOrder(USER_A);
      const api = await caller(USER_B, ['bank:read']);

      const err = await api.transfers.executions({ scheduleId: schedule.id }).catch((e: unknown) => e);
      expect(codeOf(err)).toBe('FORBIDDEN');
    });

    it('still serves the history to the user who owns the schedule', async () => {
      const schedule = await firedStandingOrder(USER_A);
      const api = await caller(USER_A, ['bank:read']);

      // The half that matters more: a check tight enough to lock the owner out
      // is a worse bug than the leak it was written for, because it breaks
      // everybody at once instead of one row at a time.
      const executions = await api.transfers.executions({ scheduleId: schedule.id });
      expect(executions).toHaveLength(1);
      expect(executions[0]).toMatchObject({ occurrence: 0, status: 'settled', amount: '100' });
    });
  });

  describe('transfers.cancel is not callable by another user', () => {
    it('refuses user B, and leaves user A’s standing order active', async () => {
      const schedule = await firedStandingOrder(USER_A);
      const api = await caller(USER_B, ['bank:write']);

      const err = await api.transfers.cancel({ scheduleId: schedule.id }).catch((e: unknown) => e);
      expect(codeOf(err)).toBe('FORBIDDEN');

      // The refusal has to come BEFORE the UPDATE. A check applied to the
      // result would refuse a caller whose write had already landed.
      expect((await bank.transfers.getSchedule(schedule.id)).status).toBe('active');
    });

    it('still lets the user who owns the schedule cancel it', async () => {
      const schedule = await firedStandingOrder(USER_A);
      const api = await caller(USER_A, ['bank:write']);

      await expect(api.transfers.cancel({ scheduleId: schedule.id })).resolves.toEqual({ cancelled: true });
      expect((await bank.transfers.getSchedule(schedule.id)).status).toBe('cancelled');
    });
  });

  describe('an ownership refusal reaches the caller as FORBIDDEN', () => {
    it('survives `guard`, which used to re-wrap it as INTERNAL_SERVER_ERROR', async () => {
      // `guard` maps service errors onto tRPC codes and its fallback is a 500.
      // A TRPCError thrown inside it is already an answer; re-wrapping told the
      // caller to retry something that can never succeed, and hid every 403 in
      // this service from anything grouping on status.
      const schedule = await firedStandingOrder(USER_A);

      const read = await (await caller(USER_B, ['bank:read'])).transfers.executions({ scheduleId: schedule.id }).catch((e: unknown) => e);
      const write = await (await caller(USER_B, ['bank:write'])).transfers.cancel({ scheduleId: schedule.id }).catch((e: unknown) => e);

      expect([codeOf(read), codeOf(write)]).toEqual(['FORBIDDEN', 'FORBIDDEN']);
    });

    it('applies to the ownership checks that were already here, not only the new ones', async () => {
      // `spaces.archive` has called `assertSelf` since svc-bank shipped, and
      // has been answering 500 to every refusal the whole time.
      const space = await bank.spaces.create({ userId: USER_A, assetId: 'USDT', name: 'Rent' });
      const api = await caller(USER_B, ['bank:write']);

      const err = await api.spaces.archive({ spaceId: space.id }).catch((e: unknown) => e);
      expect(codeOf(err)).toBe('FORBIDDEN');
    });
  });
}
