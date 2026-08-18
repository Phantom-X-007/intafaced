import { describe, expect, it, vi } from 'vitest';
import { CommerceService } from './commerce-service.js';
import { MarketError } from '../vendor-service.js';

/**
 * createListing(subscription) without a period must refuse BEFORE any write.
 * No default month is invented.
 */
describe('createListing — refuse subscription with unset period before any write', () => {
  it('refuses subscription create without period without touching sql or slots', async () => {
    const sql = Object.assign(
      vi.fn(() => {
        throw new Error('sql must not run when period is unset');
      }),
      { begin: vi.fn() },
    );
    const vendors = {
      myVendor: vi.fn(async () => {
        throw new Error('vendor lookup must not run when period is unset');
      }),
      claimSlot: vi.fn(async () => {
        throw new Error('claimSlot must not run when period is unset');
      }),
    };
    const ledger = { post: vi.fn() };
    const commerce = new CommerceService(sql as never, vendors as never, ledger as never, { commissionBps: 500 });

    await expect(
      commerce.createListing({
        userId: '11111111-1111-4111-8111-111111111111',
        title: 'Sub plan',
        description: 'monthly',
        offerType: 'subscription',
        assetId: 'USDT',
        price: '10',
      }),
    ).rejects.toMatchObject({
      name: 'MarketError',
      code: 'market.subscription_period_unset',
    });
    expect(sql).not.toHaveBeenCalled();
    expect(vendors.myVendor).not.toHaveBeenCalled();
    expect(vendors.claimSlot).not.toHaveBeenCalled();
    expect(ledger.post).not.toHaveBeenCalled();
  });

  it('refuses blank commission on a subscription before inventing a period', async () => {
    const sql = Object.assign(
      vi.fn(() => {
        throw new Error('sql must not run');
      }),
      { begin: vi.fn() },
    );
    const commerce = new CommerceService(sql as never, { myVendor: vi.fn(), claimSlot: vi.fn() } as never, { post: vi.fn() } as never, {
      commissionBps: null,
    });
    await expect(
      commerce.createListing({
        userId: '11111111-1111-4111-8111-111111111111',
        title: 'Sub',
        description: 'monthly',
        offerType: 'subscription',
        assetId: 'USDT',
        price: '10',
        periodSeconds: 86_400,
      }),
    ).rejects.toBeInstanceOf(MarketError);
    await expect(
      commerce.createListing({
        userId: '11111111-1111-4111-8111-111111111111',
        title: 'Sub',
        description: 'monthly',
        offerType: 'subscription',
        assetId: 'USDT',
        price: '10',
        periodSeconds: 86_400,
      }),
    ).rejects.toMatchObject({ code: 'market.commission_not_configured' });
    expect(sql).not.toHaveBeenCalled();
  });
});
