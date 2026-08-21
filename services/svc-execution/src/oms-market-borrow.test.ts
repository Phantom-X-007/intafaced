import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client';
import type { BorrowRate, MarketDataAdapter } from '@intafaced/venue-contracts';
import { VenueUnavailableError } from '@intafaced/venue-contracts';
import { marketDataAdapterBorrow } from './oms-market-borrow.js';

const now = new Date('2026-08-17T12:00:00.000Z');

function borrow(over: Partial<BorrowRate> = {}): BorrowRate {
  return {
    venueId: 'street',
    asset: 'USDT',
    hourlyRate: parseAmount('0.0001'),
    available: null,
    observedAt: now,
    ...over,
  };
}

function adapter(over: Partial<MarketDataAdapter> = {}): MarketDataAdapter {
  return {
    venue: { id: 'street', displayName: 'Street', kind: 'external-cex', sequencedDepth: true },
    markets: async () => [],
    snapshotBook: async () => {
      throw new Error('snapshot unused');
    },
    streamBook: async () => {
      throw new Error('stream unused');
    },
    ...over,
  };
}

describe('marketDataAdapterBorrow', () => {
  it('forwards borrowRate without rewriting null available', async () => {
    const observe = marketDataAdapterBorrow(
      adapter({
        borrowRate: async () => borrow(),
      }),
    );
    const result = await observe('USDT');
    expect(result.hourlyRate).toBe(parseAmount('0.0001'));
    expect(result.available).toBeNull();
  });

  it('throws when the adapter has no borrowRate method — does not invent 0', async () => {
    const observe = marketDataAdapterBorrow(adapter());
    await expect(observe('USDT')).rejects.toThrow(/borrowRate is not wired/);
  });

  it('propagates venue not_ready — does not invent a rate', async () => {
    const observe = marketDataAdapterBorrow(
      adapter({
        borrowRate: async () => {
          throw new VenueUnavailableError('street', 'not_ready', 'borrowRate: not built');
        },
      }),
    );
    await expect(observe('USDT')).rejects.toBeInstanceOf(VenueUnavailableError);
  });
});
