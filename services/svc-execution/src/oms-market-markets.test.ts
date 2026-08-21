import { describe, expect, it } from 'vitest';
import type { MarketDataAdapter, VenueMarket } from '@intafaced/venue-contracts';
import { VenueUnavailableError } from '@intafaced/venue-contracts';
import { marketDataAdapterMarkets } from './oms-market-markets.js';

function listed(over: Partial<VenueMarket> = {}): VenueMarket {
  return {
    venueId: 'street',
    symbol: 'BTC/USDT',
    venueSymbol: 'BTCUSDT',
    type: 'spot',
    base: 'BTC',
    quote: 'USDT',
    settle: null,
    active: false,
    contractSize: null,
    expiry: null,
    observedAt: new Date('2026-08-17T12:00:00.000Z'),
    ...over,
  } as VenueMarket;
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

describe('marketDataAdapterMarkets', () => {
  it('forwards markets without inventing a listing when the street is empty', async () => {
    const observe = marketDataAdapterMarkets(adapter());
    await expect(observe()).resolves.toEqual([]);
  });

  it('passes through inactive listings', async () => {
    const observe = marketDataAdapterMarkets(
      adapter({
        markets: async () => [listed({ active: false })],
      }),
    );
    const result = await observe();
    expect(result).toHaveLength(1);
    expect(result[0]?.active).toBe(false);
  });

  it('propagates venue not_ready — does not invent a catalog', async () => {
    const observe = marketDataAdapterMarkets(
      adapter({
        markets: async () => {
          throw new VenueUnavailableError('street', 'not_ready', 'markets: not built');
        },
      }),
    );
    await expect(observe()).rejects.toBeInstanceOf(VenueUnavailableError);
  });
});
