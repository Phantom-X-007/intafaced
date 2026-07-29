import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryLedger } from '../memory-ledger.js';
import { formatAmount, parseAmount as amt } from '../money.js';
import { houseFees, raiseContributionAccount, raiseSupplyAccount, userAvailable, vestingEscrow } from '../accounts.js';
import { InvalidEntryError } from '../types.js';
import { recipes } from './index.js';

/**
 * LAUNCHPAD MONEY PATHS (§8.4).
 *
 * These assert the properties a raise has to have to be trustworthy, not merely
 * that the entries balance:
 *
 *   · supply is escrowed before the raise can sell it;
 *   · a contributor's money sits in THEIR OWN escrow, so a refund can never be
 *     paid out of someone else's stake;
 *   · settlement is one atomic transaction per contributor, so there is no
 *     instant where the payment has left escrow and the tokens have not landed;
 *   · a failed raise returns everything, with no fee taken;
 *   · vesting sits in platform escrow and cannot be released twice.
 */

const ISSUER = '11111111-1111-4111-8111-111111111111';
const ALICE = '22222222-2222-4222-8222-222222222222';
const BOB = '33333333-3333-4333-8333-333333333333';

const RAISE = 'raise-1';
const SALE = 'PRJ';
const PAY = 'USDT';

let ledger: MemoryLedger;

beforeEach(() => {
  ledger = new MemoryLedger();
});

/** Value has to enter the book from somewhere; a rail deposit is that somewhere. */
async function fund(userId: string, assetId: string, value: string): Promise<void> {
  await ledger.post(
    recipes.deposit({ userId, assetId, amount: amt(value), rail: 'crypto-native', railRef: `seed-${userId}-${assetId}-${value}` }),
  );
}

const balanceOf = async (ref: Parameters<MemoryLedger['balance']>[0]): Promise<string> => formatAmount((await ledger.balance(ref)).amount);

describe('launch — supply escrow', () => {
  it('moves the sale supply out of the issuer’s spendable balance', async () => {
    await fund(ISSUER, SALE, '1000000');

    await ledger.post(recipes.raiseSupplyLock({ raiseId: RAISE, issuerId: ISSUER, saleAssetId: SALE, amount: amt('400000') }));

    expect(await balanceOf(userAvailable(ISSUER, SALE))).toBe('600000');
    expect(await balanceOf(raiseSupplyAccount(ISSUER, SALE, RAISE))).toBe('400000');
  });

  /**
   * An issuer cannot promise supply they do not hold. The ledger refuses before
   * the raise can open, which is the only moment refusing is cheap.
   */
  it('refuses to lock supply the issuer does not have', async () => {
    await fund(ISSUER, SALE, '100');

    await expect(
      ledger.post(recipes.raiseSupplyLock({ raiseId: RAISE, issuerId: ISSUER, saleAssetId: SALE, amount: amt('101') })),
    ).rejects.toMatchObject({ code: 'ledger.insufficient_funds' });
  });

  it('returns unsold supply to the issuer', async () => {
    await fund(ISSUER, SALE, '1000');
    await ledger.post(recipes.raiseSupplyLock({ raiseId: RAISE, issuerId: ISSUER, saleAssetId: SALE, amount: amt('1000') }));
    await ledger.post(
      recipes.raiseSupplyReturn({ raiseId: RAISE, issuerId: ISSUER, saleAssetId: SALE, amount: amt('1000'), reason: 'failed' }),
    );

    expect(await balanceOf(userAvailable(ISSUER, SALE))).toBe('1000');
    expect(await balanceOf(raiseSupplyAccount(ISSUER, SALE, RAISE))).toBe('0');
  });
});

describe('launch — contribution', () => {
  it('escrows each contributor separately, per raise', async () => {
    await fund(ALICE, PAY, '500');
    await fund(BOB, PAY, '500');

    await ledger.post(recipes.raiseContribute({ raiseId: RAISE, userId: ALICE, paymentAssetId: PAY, amount: amt('300'), sequence: 0 }));
    await ledger.post(recipes.raiseContribute({ raiseId: RAISE, userId: BOB, paymentAssetId: PAY, amount: amt('120'), sequence: 0 }));

    expect(await balanceOf(raiseContributionAccount(ALICE, PAY, RAISE))).toBe('300');
    expect(await balanceOf(raiseContributionAccount(BOB, PAY, RAISE))).toBe('120');
    expect(await balanceOf(userAvailable(ALICE, PAY))).toBe('200');
  });

  /**
   * THE ONE THAT MATTERS FOR A RETRY.
   *
   * Two workers processing the same top-up produce the same key, so the second
   * post returns the first transaction rather than taking the money twice.
   */
  it('is idempotent on (raise, contributor, sequence)', async () => {
    await fund(ALICE, PAY, '500');
    const input = { raiseId: RAISE, userId: ALICE, paymentAssetId: PAY, amount: amt('300'), sequence: 0 } as const;

    const first = await ledger.post(recipes.raiseContribute(input));
    const second = await ledger.post(recipes.raiseContribute(input));

    expect(second.id).toBe(first.id);
    expect(await balanceOf(raiseContributionAccount(ALICE, PAY, RAISE))).toBe('300');
  });

  it('lets a contributor top up under a second sequence', async () => {
    await fund(ALICE, PAY, '500');
    await ledger.post(recipes.raiseContribute({ raiseId: RAISE, userId: ALICE, paymentAssetId: PAY, amount: amt('300'), sequence: 0 }));
    await ledger.post(recipes.raiseContribute({ raiseId: RAISE, userId: ALICE, paymentAssetId: PAY, amount: amt('150'), sequence: 1 }));

    expect(await balanceOf(raiseContributionAccount(ALICE, PAY, RAISE))).toBe('450');
  });

  it('refunds everything, with no fee, when the raise does not clear', async () => {
    await fund(ALICE, PAY, '500');
    await ledger.post(recipes.raiseContribute({ raiseId: RAISE, userId: ALICE, paymentAssetId: PAY, amount: amt('300'), sequence: 0 }));
    await ledger.post(recipes.raiseRefund({ raiseId: RAISE, userId: ALICE, paymentAssetId: PAY, amount: amt('300') }));

    expect(await balanceOf(userAvailable(ALICE, PAY))).toBe('500');
    expect(await balanceOf(houseFees('launch', PAY))).toBe('0');
    expect(ledger.reconcile()).toEqual({ ok: true });
  });
});

describe('launch — settlement', () => {
  beforeEach(async () => {
    await fund(ISSUER, SALE, '1000');
    await fund(ALICE, PAY, '500');
    await ledger.post(recipes.raiseSupplyLock({ raiseId: RAISE, issuerId: ISSUER, saleAssetId: SALE, amount: amt('1000') }));
    await ledger.post(recipes.raiseContribute({ raiseId: RAISE, userId: ALICE, paymentAssetId: PAY, amount: amt('400'), sequence: 0 }));
  });

  it('pays the issuer, takes the house fee, refunds the unspent part, and delivers the tokens', async () => {
    await ledger.post(
      recipes.raiseSettleContributor({
        raiseId: RAISE,
        issuerId: ISSUER,
        userId: ALICE,
        paymentAssetId: PAY,
        contributed: amt('400'),
        refund: amt('100'),
        feeBps: 200, // 2% of the 300 actually spent
        saleAssetId: SALE,
        saleAmount: amt('600'),
      }),
    );

    expect(await balanceOf(userAvailable(ALICE, PAY))).toBe('200'); // 100 left over + 100 refunded
    expect(await balanceOf(userAvailable(ALICE, SALE))).toBe('600');
    expect(await balanceOf(userAvailable(ISSUER, PAY))).toBe('294');
    expect(await balanceOf(houseFees('launch', PAY))).toBe('6');
    expect(await balanceOf(raiseContributionAccount(ALICE, PAY, RAISE))).toBe('0');
    expect(await balanceOf(raiseSupplyAccount(ISSUER, SALE, RAISE))).toBe('400');

    expect(ledger.totalsByAsset()).toEqual({ USDT: '0', PRJ: '0' });
    expect(ledger.reconcile()).toEqual({ ok: true });
  });

  it('routes the allocation into platform vesting escrow when the raise vests', async () => {
    await ledger.post(
      recipes.raiseSettleContributor({
        raiseId: RAISE,
        issuerId: ISSUER,
        userId: ALICE,
        paymentAssetId: PAY,
        contributed: amt('400'),
        refund: 0n,
        feeBps: 0,
        saleAssetId: SALE,
        saleAmount: amt('800'),
        vestingScheduleId: 'sched-1',
      }),
    );

    // The contributor owns nothing spendable yet — that is what vesting means.
    expect(await balanceOf(userAvailable(ALICE, SALE))).toBe('0');
    expect(await balanceOf(vestingEscrow('sched-1', SALE))).toBe('800');
  });

  it('is idempotent per contributor, so a resumed settlement pays once', async () => {
    const input = {
      raiseId: RAISE,
      issuerId: ISSUER,
      userId: ALICE,
      paymentAssetId: PAY,
      contributed: amt('400'),
      refund: 0n,
      feeBps: 100,
      saleAssetId: SALE,
      saleAmount: amt('800'),
    } as const;

    const first = await ledger.post(recipes.raiseSettleContributor(input));
    const second = await ledger.post(recipes.raiseSettleContributor(input));

    expect(second.id).toBe(first.id);
    expect(await balanceOf(userAvailable(ALICE, SALE))).toBe('800');
  });

  it('refuses a settlement that would refund more than was contributed', () => {
    expect(() =>
      recipes.raiseSettleContributor({
        raiseId: RAISE,
        issuerId: ISSUER,
        userId: ALICE,
        paymentAssetId: PAY,
        contributed: amt('400'),
        refund: amt('401'),
        feeBps: 0,
        saleAssetId: SALE,
        saleAmount: amt('1'),
      }),
    ).toThrow(InvalidEntryError);
  });

  it('refuses a settlement that buys nothing — that is a refund', () => {
    expect(() =>
      recipes.raiseSettleContributor({
        raiseId: RAISE,
        issuerId: ISSUER,
        userId: ALICE,
        paymentAssetId: PAY,
        contributed: amt('400'),
        refund: amt('400'),
        feeBps: 0,
        saleAssetId: SALE,
        saleAmount: amt('1'),
      }),
    ).toThrow(InvalidEntryError);
  });

  it('refuses a raise priced in the asset it is selling', () => {
    expect(() =>
      recipes.raiseSettleContributor({
        raiseId: RAISE,
        issuerId: ISSUER,
        userId: ALICE,
        paymentAssetId: SALE,
        contributed: amt('400'),
        refund: 0n,
        feeBps: 0,
        saleAssetId: SALE,
        saleAmount: amt('1'),
      }),
    ).toThrow(InvalidEntryError);
  });

  it('refuses a fee that would leave the issuer nothing', () => {
    expect(() =>
      recipes.raiseSettleContributor({
        raiseId: RAISE,
        issuerId: ISSUER,
        userId: ALICE,
        paymentAssetId: PAY,
        contributed: amt('400'),
        refund: 0n,
        feeBps: 10_000,
        saleAssetId: SALE,
        saleAmount: amt('1'),
      }),
    ).toThrow(InvalidEntryError);
  });
});

describe('launch — vesting', () => {
  it('funds a grant out of the grantor’s own balance and releases in tranches', async () => {
    await fund(ISSUER, SALE, '1200');
    await ledger.post(recipes.vestingFund({ scheduleId: 'sched-team', grantorId: ISSUER, assetId: SALE, amount: amt('1200') }));

    expect(await balanceOf(userAvailable(ISSUER, SALE))).toBe('0');
    expect(await balanceOf(vestingEscrow('sched-team', SALE))).toBe('1200');

    await ledger.post(
      recipes.vestingRelease({ scheduleId: 'sched-team', beneficiaryId: BOB, assetId: SALE, amount: amt('400'), sequence: 0 }),
    );
    await ledger.post(
      recipes.vestingRelease({ scheduleId: 'sched-team', beneficiaryId: BOB, assetId: SALE, amount: amt('300'), sequence: 1 }),
    );

    expect(await balanceOf(userAvailable(BOB, SALE))).toBe('700');
    expect(await balanceOf(vestingEscrow('sched-team', SALE))).toBe('500');
  });

  it('cannot release the same tranche twice', async () => {
    await fund(ISSUER, SALE, '1000');
    await ledger.post(recipes.vestingFund({ scheduleId: 'sched-team', grantorId: ISSUER, assetId: SALE, amount: amt('1000') }));

    const input = { scheduleId: 'sched-team', beneficiaryId: BOB, assetId: SALE, amount: amt('400'), sequence: 0 } as const;
    const first = await ledger.post(recipes.vestingRelease(input));
    const second = await ledger.post(recipes.vestingRelease(input));

    expect(second.id).toBe(first.id);
    expect(await balanceOf(userAvailable(BOB, SALE))).toBe('400');
  });

  /**
   * One schedule can never release out of another's escrow. `module` accounts
   * are hard non-negative, and each schedule is its own account.
   */
  it('cannot over-release a schedule', async () => {
    await fund(ISSUER, SALE, '100');
    await ledger.post(recipes.vestingFund({ scheduleId: 'sched-a', grantorId: ISSUER, assetId: SALE, amount: amt('100') }));

    await expect(
      ledger.post(recipes.vestingRelease({ scheduleId: 'sched-a', beneficiaryId: BOB, assetId: SALE, amount: amt('101'), sequence: 0 })),
    ).rejects.toMatchObject({ code: 'ledger.insufficient_funds' });
  });
});
