import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, postgresAvailable, type TestDatabase } from '@intafaced/db';
import { MemoryLedger, formatAmount, parseAmount, recipes, userAvailable, type Amount } from '@intafaced/ledger-client';
import { createBankServices, type BankServices } from '../bank-service.js';
import { memoryLedgerHistory } from '../analytics/ledger-history.js';

/**
 * Unit card — bank.business dual-control LEDger holds (wave 13 L03)
 *
 * 1. Promise: §31:811 / Engine A Done bar — maker/checker holds
 * 2. Break on tip: over-threshold "pending" left available spendable (paper hold only)
 * 3. Done bar: over-threshold reserves purposed hold; concurrent drain fails;
 *    approve settles hold→dest; reject/cancel releases hold; self-approve refused
 * 4. Class M
 * 5. Paths: services/svc-bank/** · packages/ledger-client recipes (shared money path)
 * 6. RED: this suite (available drops on propose; cancel restores)
 * 7. Collision: claim-check clear; Denon #1625–1627 no svc-bank paths
 */

const URL = process.env.TEST_DATABASE_URL ?? 'postgres://intafaced_ops:intafaced_ops@localhost:5433/intafaced_test';
const here = dirname(fileURLToPath(import.meta.url));
const drizzle = join(here, '../..', 'drizzle');
const migrations = readdirSync(drizzle)
  .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
  .sort()
  .map((f) => readFileSync(join(drizzle, f), 'utf8'));

const MAKER = '11111111-1111-4111-8111-111111111111';
const CHECKER = '22222222-2222-4222-8222-222222222222';
const amt = (v: string): Amount => parseAmount(v);

const available = await postgresAvailable(URL);

if (!available) {
  describe.skip('business maker/checker (Postgres unavailable)', () => {
    it('skipped', () => undefined);
  });
} else {
  const db: TestDatabase = await createTestDatabase({ service: 'bank', url: URL, migrations });
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

  const availableOf = async (userId: string, assetId: string) =>
    formatAmount((await ledger.balance(userAvailable(userId, assetId))).amount);

  beforeEach(async () => {
    await sql`
      TRUNCATE bank.business_approvals, bank.business_members, bank.business_accounts,
               bank.transfer_executions, bank.scheduled_transfers, bank.spaces
      RESTART IDENTITY CASCADE
    `;
    ledger = new MemoryLedger();
    bank = createBankServices(sql, ledger, memoryLedgerHistory(ledger), { nativeAssetId: 'IFC' });
  });

  afterAll(async () => {
    await db.drop();
  }, 30_000);

  describe('maker/checker dual control with ledger holds', () => {
    it('posts under threshold without a checker', async () => {
      const account = await bank.business.createAccount({
        name: 'Ops Co',
        assetId: 'USDT',
        spendThreshold: amt('500'),
        creatorUserId: MAKER,
      });
      const primary = await bank.spaces.ensurePrimary(MAKER, 'USDT');
      const pot = await bank.spaces.create({ userId: MAKER, assetId: 'USDT', name: 'Vendor' });
      await fund(MAKER, 'USDT', '200');

      const result = await bank.business.proposeTransfer({
        accountId: account.id,
        makerUserId: MAKER,
        fromSpaceId: primary.id,
        toSpaceId: pot.id,
        amount: amt('100'),
      });
      expect(result.kind).toBe('posted');
      expect(await availableOf(MAKER, 'USDT')).toBe('100');
      expect(formatAmount(await bank.spaces.balanceOf(pot))).toBe('100');
      expect(ledger.reconcile()).toEqual({ ok: true });
    });

    it('reserves over-threshold on propose; checker settle lands at destination', async () => {
      const account = await bank.business.createAccount({
        name: 'Ops Co',
        assetId: 'USDT',
        spendThreshold: amt('100'),
        creatorUserId: MAKER,
      });
      await bank.business.addMember({
        accountId: account.id,
        actorUserId: MAKER,
        userId: CHECKER,
        role: 'checker',
      });
      const primary = await bank.spaces.ensurePrimary(MAKER, 'USDT');
      const pot = await bank.spaces.create({ userId: MAKER, assetId: 'USDT', name: 'Payroll' });
      await fund(MAKER, 'USDT', '1000');

      const proposed = await bank.business.proposeTransfer({
        accountId: account.id,
        makerUserId: MAKER,
        fromSpaceId: primary.id,
        toSpaceId: pot.id,
        amount: amt('250'),
      });
      expect(proposed.kind).toBe('pending');
      // LEDger hold: available drops immediately; pot not credited yet.
      expect(await availableOf(MAKER, 'USDT')).toBe('750');
      expect(formatAmount(await bank.spaces.balanceOf(pot))).toBe('0');
      if (proposed.kind !== 'pending') throw new Error('expected pending');
      expect(proposed.approval.holdLedgerTxId).toBeTruthy();

      await expect(
        bank.business.approve({
          approvalId: proposed.approval.id,
          checkerUserId: MAKER,
        }),
      ).rejects.toMatchObject({ code: 'bank.business_self_approve' });

      const posted = await bank.business.approve({
        approvalId: proposed.approval.id,
        checkerUserId: CHECKER,
      });
      expect(posted.ledgerTxId).toBeTruthy();
      expect(await availableOf(MAKER, 'USDT')).toBe('750');
      expect(formatAmount(await bank.spaces.balanceOf(pot))).toBe('250');
      expect(ledger.reconcile()).toEqual({ ok: true });
    });

    it('held funds cannot be double-spent while pending', async () => {
      const account = await bank.business.createAccount({
        name: 'Ops Co',
        assetId: 'USDT',
        spendThreshold: amt('50'),
        creatorUserId: MAKER,
      });
      await bank.business.addMember({
        accountId: account.id,
        actorUserId: MAKER,
        userId: CHECKER,
        role: 'checker',
      });
      const primary = await bank.spaces.ensurePrimary(MAKER, 'USDT');
      const pot = await bank.spaces.create({ userId: MAKER, assetId: 'USDT', name: 'A' });
      const other = await bank.spaces.create({ userId: MAKER, assetId: 'USDT', name: 'B' });
      await fund(MAKER, 'USDT', '100');

      const proposed = await bank.business.proposeTransfer({
        accountId: account.id,
        makerUserId: MAKER,
        fromSpaceId: primary.id,
        toSpaceId: pot.id,
        amount: amt('100'),
      });
      if (proposed.kind !== 'pending') throw new Error('expected pending');
      expect(await availableOf(MAKER, 'USDT')).toBe('0');

      await expect(
        bank.transfers.transfer({
          transferId: 'drain-attempt',
          fromSpaceId: primary.id,
          toSpaceId: other.id,
          amount: amt('1'),
        }),
      ).rejects.toBeTruthy();

      await bank.business.approve({ approvalId: proposed.approval.id, checkerUserId: CHECKER });
      expect(formatAmount(await bank.spaces.balanceOf(pot))).toBe('100');
      expect(ledger.reconcile()).toEqual({ ok: true });
    });

    it('reject releases the hold back to available', async () => {
      const account = await bank.business.createAccount({
        name: 'Ops Co',
        assetId: 'USDT',
        spendThreshold: amt('10'),
        creatorUserId: MAKER,
      });
      await bank.business.addMember({
        accountId: account.id,
        actorUserId: MAKER,
        userId: CHECKER,
        role: 'checker',
      });
      const primary = await bank.spaces.ensurePrimary(MAKER, 'USDT');
      const pot = await bank.spaces.create({ userId: MAKER, assetId: 'USDT', name: 'X' });
      await fund(MAKER, 'USDT', '100');

      const proposed = await bank.business.proposeTransfer({
        accountId: account.id,
        makerUserId: MAKER,
        fromSpaceId: primary.id,
        toSpaceId: pot.id,
        amount: amt('50'),
      });
      if (proposed.kind !== 'pending') throw new Error('expected pending');
      expect(await availableOf(MAKER, 'USDT')).toBe('50');

      await bank.business.reject({ approvalId: proposed.approval.id, checkerUserId: CHECKER });
      expect(await availableOf(MAKER, 'USDT')).toBe('100');
      expect(formatAmount(await bank.spaces.balanceOf(pot))).toBe('0');
      expect(ledger.reconcile()).toEqual({ ok: true });
    });

    it('maker cancel releases the hold', async () => {
      const account = await bank.business.createAccount({
        name: 'Ops Co',
        assetId: 'USDT',
        spendThreshold: amt('10'),
        creatorUserId: MAKER,
      });
      const primary = await bank.spaces.ensurePrimary(MAKER, 'USDT');
      const pot = await bank.spaces.create({ userId: MAKER, assetId: 'USDT', name: 'Y' });
      await fund(MAKER, 'USDT', '80');

      const proposed = await bank.business.proposeTransfer({
        accountId: account.id,
        makerUserId: MAKER,
        fromSpaceId: primary.id,
        toSpaceId: pot.id,
        amount: amt('40'),
      });
      if (proposed.kind !== 'pending') throw new Error('expected pending');
      expect(await availableOf(MAKER, 'USDT')).toBe('40');

      await bank.business.cancel({ approvalId: proposed.approval.id, actorUserId: MAKER });
      expect(await availableOf(MAKER, 'USDT')).toBe('80');
      expect(ledger.reconcile()).toEqual({ ok: true });
    });

    it('refuses a non-member checker', async () => {
      const account = await bank.business.createAccount({
        name: 'Ops Co',
        assetId: 'USDT',
        spendThreshold: amt('10'),
        creatorUserId: MAKER,
      });
      const primary = await bank.spaces.ensurePrimary(MAKER, 'USDT');
      const pot = await bank.spaces.create({ userId: MAKER, assetId: 'USDT', name: 'X' });
      await fund(MAKER, 'USDT', '100');
      const proposed = await bank.business.proposeTransfer({
        accountId: account.id,
        makerUserId: MAKER,
        fromSpaceId: primary.id,
        toSpaceId: pot.id,
        amount: amt('50'),
      });
      if (proposed.kind !== 'pending') throw new Error('expected pending');
      await expect(bank.business.approve({ approvalId: proposed.approval.id, checkerUserId: CHECKER })).rejects.toMatchObject({
        code: 'bank.business_not_member',
      });
    });
  });
}
