import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, postgresAvailable, type TestDatabase } from '@intafaced/db';
import { MemoryLedger, formatAmount, parseAmount, recipes, userAvailable, type Amount } from '@intafaced/ledger-client';
import { createBankServices, type BankServices } from '../bank-service.js';
import { memoryLedgerHistory } from '../analytics/ledger-history.js';

/**
 * Unit card — bank.business maker/checker honest partial (wave 10 L08)
 *
 * 1. Promise: §31:811 / tracker — maker/checker spend thresholds
 * 2. Break: no dual-control; over-threshold transfers single-actor
 * 3. Done bar: over-threshold needs second member; self-approve refused; under threshold posts
 * 4. Class M
 * 5. Paths: services/svc-bank/**
 * 6. RED: this suite
 * 7. Collision: bank wall under nitro-w10-l08 claim
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

  describe('maker/checker dual control', () => {
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

    it('holds over-threshold until a different checker approves', async () => {
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
      expect(await availableOf(MAKER, 'USDT')).toBe('1000');

      await expect(
        bank.business.approve({
          approvalId: proposed.kind === 'pending' ? proposed.approval.id : '',
          checkerUserId: MAKER,
        }),
      ).rejects.toMatchObject({ code: 'bank.business_self_approve' });

      if (proposed.kind !== 'pending') throw new Error('expected pending');
      const posted = await bank.business.approve({
        approvalId: proposed.approval.id,
        checkerUserId: CHECKER,
      });
      expect(posted.ledgerTxId).toBeTruthy();
      expect(await availableOf(MAKER, 'USDT')).toBe('750');
      expect(formatAmount(await bank.spaces.balanceOf(pot))).toBe('250');
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
