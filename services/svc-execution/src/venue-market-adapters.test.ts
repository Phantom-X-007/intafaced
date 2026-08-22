import { describe, expect, it } from 'vitest';
import type { MarketDataAdapter } from '@intafaced/venue-contracts';
import {
  buildExecutionVenueMarketMaps,
  buildExecutionVenueMarketMapsWithPublicMdSupplement,
  wireExecutionVenueMarketAdapter,
} from './venue-market-adapters.js';

function fakeMd(id: string): MarketDataAdapter {
  return {
    venue: { id, displayName: id, kind: 'external-cex', sequencedDepth: true },
    markets: async () => [],
    snapshotBook: async (symbol) => ({
      venueId: id,
      symbol,
      bids: [],
      asks: [],
      sequenced: false,
      sequence: -1,
      observedAt: new Date('2026-08-22T00:00:00.000Z'),
    }),
  };
}

describe('venue-market-adapters', () => {
  it('wires public MD observation for known venue ids', () => {
    const maps = buildExecutionVenueMarketMaps(['binance-spot', 'bybit-spot'], {
      createAdapter: (id) => (id === 'binance-spot' || id === 'bybit-spot' ? fakeMd(id) : null),
    });
    expect(maps.wiredVenueIds).toEqual(['binance-spot', 'bybit-spot']);
    expect(maps.snapshotByVenue['binance-spot']).toEqual(expect.any(Function));
    expect(maps.marketsByVenue['bybit-spot']).toEqual(expect.any(Function));
  });

  it('skips unknown venue ids without inventing adapters', () => {
    const maps = buildExecutionVenueMarketMaps(['binance-spot', 'fantasy-cex'], {
      createAdapter: (id) => (id === 'binance-spot' ? fakeMd(id) : null),
    });
    expect(maps.wiredVenueIds).toEqual(['binance-spot']);
    expect(maps.snapshotByVenue['fantasy-cex']).toBeUndefined();
  });

  it('wireExecutionVenueMarketAdapter uses injected factory', () => {
    const wire = wireExecutionVenueMarketAdapter('okx-spot', {
      createAdapter: (id) => (id === 'okx-spot' ? fakeMd(id) : null),
    });
    expect(wire.snapshot).toEqual(expect.any(Function));
    expect(wire.markets).toEqual(expect.any(Function));
  });

  it('buildExecutionVenueMarketMapsWithPublicMdSupplement wires public MD venues not in EXECUTION_VENUE_IDS', () => {
    const maps = buildExecutionVenueMarketMapsWithPublicMdSupplement([], {
      createAdapter: (id) => (id === 'binance-spot' ? fakeMd(id) : null),
    });
    expect(maps.wiredVenueIds).toContain('binance-spot');
    expect(maps.publicMdSupplementVenueIds).toContain('binance-spot');
    expect(maps.snapshotByVenue['binance-spot']).toEqual(expect.any(Function));
  });
});
