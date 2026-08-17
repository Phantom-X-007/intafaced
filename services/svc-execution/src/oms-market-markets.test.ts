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

  it('filters by type without inventing a missing listing', async () => {
    const observe = marketDataAdapterMarkets(
      adapter({
        markets: async () => [listed(), listed({ type: 'perpetual', symbol: 'BTC/USDT:USDT', venueSymbol: 'BTCUSDT', settle: 'USDT' })],
      }),
    );
    expect((await observe('perpetual')).map((row) => row.type)).toEqual(['perpetual']);
    expect(await observe('option')).toEqual([]);
    expect(await observe()).toHaveLength(2);
  });

  it('filters by quote without inventing a missing listing', async () => {
    const observe = marketDataAdapterMarkets(
      adapter({
        markets: async () => [listed(), listed({ quote: 'BTC', symbol: 'ETH/BTC', venueSymbol: 'ETHBTC', base: 'ETH' })],
      }),
    );
    expect((await observe(undefined, 'BTC')).map((row) => row.quote)).toEqual(['BTC']);
    expect(await observe(undefined, 'EUR')).toEqual([]);
    expect(await observe()).toHaveLength(2);
  });

  it('filters by base without inventing a missing listing', async () => {
    const observe = marketDataAdapterMarkets(
      adapter({
        markets: async () => [listed(), listed({ quote: 'BTC', symbol: 'ETH/BTC', venueSymbol: 'ETHBTC', base: 'ETH' })],
      }),
    );
    expect((await observe(undefined, undefined, 'ETH')).map((row) => row.base)).toEqual(['ETH']);
    expect(await observe(undefined, undefined, 'DOGE')).toEqual([]);
    expect(await observe()).toHaveLength(2);
  });

  it('filters by active without hiding halted when omitted', async () => {
    const observe = marketDataAdapterMarkets(
      adapter({
        markets: async () => [listed({ active: false }), listed({ active: true, symbol: 'ETH/USDT', venueSymbol: 'ETHUSDT', base: 'ETH' })],
      }),
    );
    expect((await observe(undefined, undefined, undefined, true)).map((row) => row.symbol)).toEqual(['ETH/USDT']);
    expect((await observe(undefined, undefined, undefined, false)).map((row) => row.active)).toEqual([false]);
    expect(await observe()).toHaveLength(2);
  });

  it('filters by settle without hiding null-settle spot when omitted', async () => {
    const observe = marketDataAdapterMarkets(
      adapter({
        markets: async () => [listed(), listed({ type: 'perpetual', symbol: 'BTC/USDT:USDT', venueSymbol: 'BTCUSDT', settle: 'USDT' })],
      }),
    );
    expect((await observe(undefined, undefined, undefined, undefined, 'USDT')).map((row) => row.settle)).toEqual(['USDT']);
    expect(await observe(undefined, undefined, undefined, undefined, 'USD')).toEqual([]);
    expect(await observe()).toHaveLength(2);
    expect((await observe())[0]?.settle).toBeNull();
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
