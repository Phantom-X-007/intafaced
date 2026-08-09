import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryLedger } from '../memory-ledger.js';
import { formatAmount, parseAmount as amt } from '../money.js';
import { earnPoolReserve, earnStakeAccount, houseFees, userAvailable } from '../accounts.js';
import { InvalidEntryError } from '../types.js';
import { recipes } from './index.js';

/**
 * BANK RECIPES (transfer + earn) — package-level.
 *
 * Earn interest is not minted: it debits a funded pool reserve. Transfer refuses
 * cross-asset and lock-kind targets. Occurrence is part of the transfer key so
 * scheduled re-runs cannot silently no-op.
 */

const USER = '22222222-2222-4222-8222-222222222222';
const USER_B = '33333333-3333-4333-8333-333333333333';
const POOL = 'pool-flex-usdt';

let ledger: MemoryLedger;

beforeEach(() => {
  ledger = new MemoryLedger();
});

async function deposit(userId: string, amount: string, tag: string): Promise<void> {
  await ledger.post(
    recipes.deposit({
      userId,
      assetId: 'USDT',
      amount: amt(amount),
      rail: 'test',
      railRef: `dep-${tag}`,
    }),
  );
}

describe('bankTransfer', () => {
  it('moves available → available and is re-drive safe per occurrence', async () => {
    await deposit(USER, '100', 't1');
    const body = {
      transferId: 'xfer-1',
      from: userAvailable(USER, 'USDT'),
      to: userAvailable(USER_B, 'USDT'),
      amount: amt('40'),
      kind: 'manual' as const,
      occurrence: 0,
    };
    const first = await ledger.post(recipes.bankTransfer(body));
    const second = await ledger.post(recipes.bankTransfer(body));
    expect(second.id).toBe(first.id);
    expect(formatAmount((await ledger.balance(userAvailable(USER, 'USDT'))).amount)).toBe('60');
    expect(formatAmount((await ledger.balance(userAvailable(USER_B, 'USDT'))).amount)).toBe('40');
    expect(ledger.reconcile()).toEqual({ ok: true });
  });

  it('refuses cross-asset and non-available kinds', () => {
    expect(() =>
      recipes.bankTransfer({
        transferId: 'x',
        from: userAvailable(USER, 'USDT'),
        to: userAvailable(USER_B, 'BTC'),
        amount: amt('1'),
        kind: 'manual',
        occurrence: 0,
      }),
    ).toThrow(/cannot change asset/);

    expect(() =>
      recipes.bankTransfer({
        transferId: 'x',
        from: userAvailable(USER, 'USDT'),
        to: earnStakeAccount(USER_B, 'USDT', 'pos-1'),
        amount: amt('1'),
        kind: 'manual',
        occurrence: 0,
      }),
    ).toThrow(/available accounts only/);
  });

  it('occurrence is part of the key — a second schedule run is a different movement', () => {
    const a = recipes.bankTransfer({
      transferId: 'sched-1',
      from: userAvailable(USER, 'USDT'),
      to: userAvailable(USER_B, 'USDT'),
      amount: amt('1'),
      kind: 'scheduled',
      occurrence: 0,
    });
    const b = recipes.bankTransfer({
      transferId: 'sched-1',
      from: userAvailable(USER, 'USDT'),
      to: userAvailable(USER_B, 'USDT'),
      amount: amt('1'),
      kind: 'scheduled',
      occurrence: 1,
    });
    expect(a.idempotencyKey).not.toBe(b.idempotencyKey);
  });
});

describe('earn — stake stays user-owned; interest is not minted', () => {
  it('deposit then withdraw returns the principal to available', async () => {
    await deposit(USER, '200', 'earn1');
    await ledger.post(
      recipes.earnDeposit({
        positionId: 'pos-1',
        poolId: POOL,
        userId: USER,
        assetId: 'USDT',
        amount: amt('200'),
      }),
    );
    expect(formatAmount((await ledger.balance(earnStakeAccount(USER, 'USDT', 'pos-1'))).amount)).toBe('200');
    expect(formatAmount((await ledger.balance(userAvailable(USER, 'USDT'))).amount)).toBe('0');

    await ledger.post(
      recipes.earnWithdraw({
        positionId: 'pos-1',
        poolId: POOL,
        userId: USER,
        assetId: 'USDT',
        amount: amt('200'),
      }),
    );
    expect(formatAmount((await ledger.balance(userAvailable(USER, 'USDT'))).amount)).toBe('200');
    expect(ledger.reconcile()).toEqual({ ok: true });
  });

  it('interest pays from a funded pool reserve — underfunded fails at the book', async () => {
    await deposit(USER, '100', 'yield-src');
    await ledger.post(
      recipes.feeCharge({
        chargeId: 'yield-fee',
        userId: USER,
        module: 'bank',
        mode: 'asset',
        assetId: 'USDT',
        amount: amt('100'),
      }),
    );
    await ledger.post(recipes.earnPoolFund({ poolId: POOL, fundingId: 'day-seed', assetId: 'USDT', amount: amt('100') }));

    await ledger.post(
      recipes.earnInterest({
        poolId: POOL,
        date: '2026-08-09',
        assetId: 'USDT',
        payouts: [{ userId: USER, amount: amt('30') }],
      }),
    );
    expect(formatAmount((await ledger.balance(userAvailable(USER, 'USDT'))).amount)).toBe('30');
    expect(formatAmount((await ledger.balance(earnPoolReserve(POOL, 'USDT'))).amount)).toBe('70');

    // Same day re-drive is idempotent.
    const again = await ledger.post(
      recipes.earnInterest({
        poolId: POOL,
        date: '2026-08-09',
        assetId: 'USDT',
        payouts: [{ userId: USER, amount: amt('30') }],
      }),
    );
    expect(formatAmount((await ledger.balance(userAvailable(USER, 'USDT'))).amount)).toBe('30');

    // Overdraw the remaining 70.
    await expect(
      ledger.post(
        recipes.earnInterest({
          poolId: POOL,
          date: '2026-08-10',
          assetId: 'USDT',
          payouts: [{ userId: USER, amount: amt('80') }],
        }),
      ),
    ).rejects.toThrow();
    expect(again.id).toBeTruthy();
    expect(ledger.reconcile()).toEqual({ ok: true });
  });

  it('refuses empty accrual and bad date shape', () => {
    expect(() => recipes.earnInterest({ poolId: POOL, date: '2026-08-09', assetId: 'USDT', payouts: [] })).toThrow(InvalidEntryError);
    expect(() =>
      recipes.earnInterest({
        poolId: POOL,
        date: '09/08/2026',
        assetId: 'USDT',
        payouts: [{ userId: USER, amount: amt('1') }],
      }),
    ).toThrow(/YYYY-MM-DD/);
  });
});
