import { describe, expect, it, vi } from 'vitest';
import { MarketError } from '../vendor-service.js';
import type { ListingRecord } from '../commerce/commerce-service.js';
import { createStrategyListing, refuseStrategyCopyLaw, strategyCatalogue, toStrategyCreateListingInput } from './strategy-listing.js';

const USER = '11111111-1111-4111-8111-111111111111';

function baseInput() {
  return {
    userId: USER,
    title: 'Mean revert',
    description: 'A listed strategy',
    assetId: 'USDT',
    price: '12.50',
    periodSeconds: 86_400,
  };
}

describe('strategy listing glue', () => {
  it('maps a strategy publish onto createListing(subscription) with periodSeconds', () => {
    expect(toStrategyCreateListingInput(baseInput())).toEqual({
      userId: USER,
      title: 'Mean revert',
      description: 'A listed strategy',
      offerType: 'subscription',
      assetId: 'USDT',
      price: '12.50',
      periodSeconds: 86_400,
    });
  });

  it('refuses an unset period without inventing a cadence', () => {
    try {
      toStrategyCreateListingInput({ ...baseInput(), periodSeconds: 0 });
      throw new Error('expected refuse');
    } catch (err) {
      expect(err).toBeInstanceOf(MarketError);
      expect(err).toMatchObject({ code: 'market.subscription_period_unset' });
    }
  });

  it('refuses a P&L / profit-share fee (copy law)', () => {
    try {
      refuseStrategyCopyLaw({ ...baseInput(), profitShareBps: 200 });
      throw new Error('expected refuse');
    } catch (err) {
      expect(err).toMatchObject({ code: 'market.strategy_profit_share_forbidden' });
    }
    try {
      toStrategyCreateListingInput({ ...baseInput(), pnlFee: '0.1' });
      throw new Error('expected refuse');
    } catch (err) {
      expect(err).toMatchObject({ code: 'market.strategy_profit_share_forbidden' });
    }
  });

  it('refuses a returns-ranked board', () => {
    try {
      refuseStrategyCopyLaw({ rankByReturn: true });
      throw new Error('expected refuse');
    } catch (err) {
      expect(err).toMatchObject({ code: 'market.strategy_return_rank_forbidden' });
    }
  });

  it('forwards the named unstaked refuse from createListing / claimSlot', async () => {
    const commerce = {
      createListing: vi.fn(async () => {
        throw new MarketError('Stake is required to hold a listing slot', 'market.stake_required');
      }),
    };
    await expect(createStrategyListing(commerce, baseInput())).rejects.toMatchObject({
      name: 'MarketError',
      code: 'market.stake_required',
    });
    expect(commerce.createListing).toHaveBeenCalledWith(
      expect.objectContaining({ offerType: 'subscription', periodSeconds: 86_400, price: '12.50' }),
    );
  });

  it('catalogue is registration order and carries no return rank field', () => {
    const older: ListingRecord = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      vendorId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      title: 'First',
      description: 'older',
      offerType: 'subscription',
      assetId: 'USDT',
      price: '1',
      periodSeconds: 86_400,
      status: 'active',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    };
    const newer: ListingRecord = {
      ...older,
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      title: 'Second',
      createdAt: '2026-08-02T00:00:00.000Z',
      updatedAt: '2026-08-02T00:00:00.000Z',
    };
    const oneTime: ListingRecord = {
      ...older,
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      offerType: 'one_time',
      periodSeconds: null,
      title: 'Not a strategy',
    };
    const ranked = strategyCatalogue([newer, oneTime, older]);
    expect(ranked.map((row) => row.title)).toEqual(['First', 'Second']);
    expect(ranked[0]).not.toHaveProperty('returnPct');
    expect(ranked[0]).not.toHaveProperty('pnlPct');
    expect(JSON.stringify(ranked)).not.toMatch(/%|\+/);
  });
});
