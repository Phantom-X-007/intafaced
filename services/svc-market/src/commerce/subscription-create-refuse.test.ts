import { describe, expect, it, vi } from 'vitest';
import { CommerceService } from './commerce-service.js';
import { MarketError } from '../vendor-service.js';

/**
 * createListing(subscription) must refuse BEFORE any write or slot claim.
 *
 * Stage C3 is not built. A successful create would burn a stake-gated listing
 * slot for inventory purchase already refuses — and oldest-slot-first it can
 * steal entitled quota from a later one-time listing. That is the same shopfront
 * lie blank commission used to make. No venue/pair catalogue is invented here.
 *
 * No Postgres: the proof is that sql and VendorService are never touched.
 */
describe('createListing — refuse unbuilt subscription before any write', () => {
  it('refuses subscription create without touching sql or slots', async () => {
    const sql = Object.assign(
      vi.fn(() => {
        throw new Error('sql must not run for an unbuilt offer type');
      }),
      { begin: vi.fn() },
    );
    const vendors = {
      myVendor: vi.fn(async () => {
        throw new Error('vendor lookup must not run for an unbuilt offer type');
      }),
      claimSlot: vi.fn(async () => {
        throw new Error('claimSlot must not run for an unbuilt offer type');
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
      code: 'market.subscription_not_built',
    });
    expect(sql).not.toHaveBeenCalled();
    expect(vendors.myVendor).not.toHaveBeenCalled();
    expect(vendors.claimSlot).not.toHaveBeenCalled();
    expect(ledger.post).not.toHaveBeenCalled();
  });

  it('refuses subscription even when commission is configured (C3 is the gate, not the rate)', async () => {
    const commerce = new CommerceService(vi.fn() as never, { myVendor: vi.fn(), claimSlot: vi.fn() } as never, { post: vi.fn() } as never, {
      commissionBps: 0,
    });
    await expect(
      commerce.createListing({
        userId: '11111111-1111-4111-8111-111111111111',
        title: 'Sub',
        description: 'monthly',
        offerType: 'subscription',
        assetId: 'USDT',
        price: '10',
      }),
    ).rejects.toBeInstanceOf(MarketError);
  });
});
