import { describe, expect, it } from 'vitest';
import { planOmsArbAtomicLegs } from './oms-arb-plan-legs.js';

describe('planOmsArbAtomicLegs', () => {
  it('plans buy+sell legs when both venues are pre-positioned', () => {
    expect(
      planOmsArbAtomicLegs({
        symbol: 'BTC/USDT',
        amount: '1',
        buyVenueId: 'binance',
        sellVenueId: 'bybit',
        inventory: { prePositionedByVenue: { binance: true, bybit: true } },
      }),
    ).toMatchObject({
      ok: true,
      atomic: true,
      legs: [
        { side: 'buy', venueId: 'binance' },
        { side: 'sell', venueId: 'bybit' },
      ],
    });
  });

  it('refuses when inventory is missing on either leg', () => {
    expect(
      planOmsArbAtomicLegs({
        symbol: 'BTC/USDT',
        amount: '1',
        buyVenueId: 'binance',
        sellVenueId: 'bybit',
        inventory: { prePositionedByVenue: { binance: true, bybit: false } },
      }),
    ).toMatchObject({ ok: false, reason: 'inventory_missing' });
  });
});
