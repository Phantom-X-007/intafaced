import { describe, expect, it } from 'vitest';
import { MemoryLedger, formatAmount, parseAmount as amt, houseFees, userAvailable, recipes } from '../index.js';
import { marketPurchase } from './market.js';
import { InvalidEntryError } from '../types.js';

const BUYER = '11111111-1111-4111-8111-111111111111';
const VENDOR = '22222222-2222-4222-8222-222222222222';

describe('marketPurchase', () => {
  it('refuses non-integer / out-of-range bps', () => {
    expect(() =>
      marketPurchase({
        purchaseId: 'p1',
        listingId: 'l1',
        buyerId: BUYER,
        vendorUserId: VENDOR,
        assetId: 'USDT',
        price: amt('10'),
        commissionBps: 10_000,
      }),
    ).toThrow(InvalidEntryError);

    expect(() =>
      marketPurchase({
        purchaseId: 'p1',
        listingId: 'l1',
        buyerId: BUYER,
        vendorUserId: VENDOR,
        assetId: 'USDT',
        price: amt('10'),
        commissionBps: 1.5,
      }),
    ).toThrow(InvalidEntryError);
  });

  it('refuses self-purchase', () => {
    expect(() =>
      marketPurchase({
        purchaseId: 'p1',
        listingId: 'l1',
        buyerId: BUYER,
        vendorUserId: BUYER,
        assetId: 'USDT',
        price: amt('10'),
        commissionBps: 250,
      }),
    ).toThrow(InvalidEntryError);
  });

  it('floors commission at scaled precision so buyer pays exactly the listed price', () => {
    // 100 * 333 bps = 3.33 exactly at 18dp; vendor 96.67. Floor vs ceil only
    // diverges on fractional wei — the invariant is buyer + parts balance.
    const req = marketPurchase({
      purchaseId: 'p-floor',
      listingId: 'l1',
      buyerId: BUYER,
      vendorUserId: VENDOR,
      assetId: 'USDT',
      price: amt('100'),
      commissionBps: 333,
    });
    expect(req.idempotencyKey).toBe('market.purchase:p-floor');
    expect(req.module).toBe('market');
    expect(req.reason).toBe('market.purchase');

    const buyerCredit = req.entries.find((e) => e.account.ownerId === BUYER && e.direction === 'credit');
    const vendorDebit = req.entries.find((e) => e.account.ownerId === VENDOR && e.direction === 'debit');
    const houseDebit = req.entries.find((e) => e.account.ownerType === 'house' && e.direction === 'debit');

    expect(formatAmount(buyerCredit!.amount)).toBe('100');
    expect(formatAmount(vendorDebit!.amount)).toBe('96.67');
    expect(formatAmount(houseDebit!.amount)).toBe('3.33');
    expect(buyerCredit!.amount).toBe(vendorDebit!.amount + houseDebit!.amount);
  });

  it('floor never invents a wei of house revenue beyond the bps share', () => {
    // 1 wei * 1 bps floors to 0 commission under floor; ceil would invent 1 wei.
    const req = marketPurchase({
      purchaseId: 'p-wei',
      listingId: 'l1',
      buyerId: BUYER,
      vendorUserId: VENDOR,
      assetId: 'USDT',
      price: 1n, // one scaled unit
      commissionBps: 1,
    });
    const houseDebit = req.entries.find((e) => e.account.ownerType === 'house');
    expect(houseDebit).toBeUndefined();
    expect(req.entries).toHaveLength(2);
  });

  it('allows zero commission when owner sets bps to 0 (explicit free)', () => {
    const req = marketPurchase({
      purchaseId: 'p-free',
      listingId: 'l1',
      buyerId: BUYER,
      vendorUserId: VENDOR,
      assetId: 'USDT',
      price: amt('50'),
      commissionBps: 0,
    });
    expect(req.entries).toHaveLength(2);
    expect(req.entries.some((e) => e.account.ownerType === 'house')).toBe(false);
  });

  it('posts once under the same purchaseId (ledger idempotency)', async () => {
    const ledger = new MemoryLedger();
    await ledger.post(
      recipes.deposit({
        userId: BUYER,
        assetId: 'USDT',
        amount: amt('1000'),
        rail: 'test',
        railRef: 'seed-1',
      }),
    );

    const body = {
      purchaseId: 'same-p',
      listingId: 'l1',
      buyerId: BUYER,
      vendorUserId: VENDOR,
      assetId: 'USDT',
      price: amt('100'),
      commissionBps: 500, // 5%
    };

    const first = await ledger.post(marketPurchase(body));
    const second = await ledger.post(marketPurchase(body));
    expect(second.id).toBe(first.id);

    expect(formatAmount((await ledger.balance(userAvailable(BUYER, 'USDT'))).amount)).toBe('900');
    expect(formatAmount((await ledger.balance(userAvailable(VENDOR, 'USDT'))).amount)).toBe('95');
    expect(formatAmount((await ledger.balance(houseFees('market', 'USDT'))).amount)).toBe('5');
  });
});
