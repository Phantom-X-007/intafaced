import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client';
import type { FundingRate, MarketDataAdapter } from '@intafaced/venue-contracts';
import { VenueUnavailableError } from '@intafaced/venue-contracts';
import { marketDataAdapterFunding } from './oms-market-funding.js';

const now = new Date('2026-08-17T12:00:00.000Z');

function funding(over: Partial<FundingRate> = {}): FundingRate {
  return {
    venueId: 'street',
    symbol: 'BTC/USDT',
    rate: parseAmount('0.0001'),
    intervalSeconds: 28_800,
    nextFundingAt: now,
    markPrice: null,
    indexPrice: null,
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

describe('marketDataAdapterFunding', () => {
  it('forwards fundingRate without rewriting a null mark', async () => {
    const observe = marketDataAdapterFunding(
      adapter({
        fundingRate: async () => funding(),
      }),
    );
    const result = await observe('BTC/USDT');
    expect(result.rate).toBe(parseAmount('0.0001'));
    expect(result.markPrice).toBeNull();
    expect(result.indexPrice).toBeNull();
  });

  it('throws when the adapter has no fundingRate method — does not invent 0', async () => {
    const observe = marketDataAdapterFunding(adapter());
    await expect(observe('BTC/USDT')).rejects.toThrow(/fundingRate is not wired/);
  });

  it('propagates venue not_ready — does not invent a rate', async () => {
    const observe = marketDataAdapterFunding(
      adapter({
        fundingRate: async () => {
          throw new VenueUnavailableError('street', 'not_ready', 'fundingRate: not built');
        },
      }),
    );
    await expect(observe('BTC/USDT')).rejects.toBeInstanceOf(VenueUnavailableError);
  });
});
