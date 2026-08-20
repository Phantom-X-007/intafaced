import { describe, expect, it } from 'vitest';
import type { MarketDataAdapter, VenueBookSnapshot } from '@intafaced/venue-contracts';
import { VenueUnavailableError } from '@intafaced/venue-contracts';
import { marketDataAdapterSnapshot } from './oms-market-snapshot.js';

const now = new Date('2026-08-17T12:00:00.000Z');

function emptyBook(over: Partial<VenueBookSnapshot> = {}): VenueBookSnapshot {
  return {
    venueId: 'street',
    symbol: 'BTC/USDT',
    bids: [],
    asks: [],
    sequence: -1,
    sequenced: false,
    observedAt: now,
    ...over,
  };
}

function adapter(over: Partial<MarketDataAdapter> = {}): MarketDataAdapter {
  return {
    venue: { id: 'street', displayName: 'Street', kind: 'external-cex', sequencedDepth: true },
    markets: async () => [],
    snapshotBook: async () => emptyBook(),
    streamBook: async () => {
      throw new Error('stream unused');
    },
    ...over,
  };
}

describe('marketDataAdapterSnapshot', () => {
  it('forwards snapshotBook without inventing a mid on an empty unsequenced book', async () => {
    const observe = marketDataAdapterSnapshot(adapter());
    const result = await observe('BTC/USDT');
    expect(result.bids).toEqual([]);
    expect(result.asks).toEqual([]);
    expect(result.sequenced).toBe(false);
    expect(result.sequence).toBe(-1);
  });

  it('forwards symbol and optional limit', async () => {
    const seen: Array<{ symbol: string; limit?: number }> = [];
    const observe = marketDataAdapterSnapshot(
      adapter({
        snapshotBook: async (symbol, limit) => {
          seen.push({ symbol, limit });
          return emptyBook({ symbol });
        },
      }),
    );
    await observe('ETH/USDT', 10);
    await observe('ETH/USDT');
    expect(seen).toEqual([
      { symbol: 'ETH/USDT', limit: 10 },
      { symbol: 'ETH/USDT', limit: undefined },
    ]);
  });

  it('propagates venue not_ready — does not invent a book', async () => {
    const observe = marketDataAdapterSnapshot(
      adapter({
        snapshotBook: async () => {
          throw new VenueUnavailableError('street', 'not_ready', 'snapshotBook: not built');
        },
      }),
    );
    await expect(observe('BTC/USDT')).rejects.toBeInstanceOf(VenueUnavailableError);
  });
});
