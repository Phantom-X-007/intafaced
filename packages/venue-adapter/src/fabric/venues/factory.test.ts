import { describe, expect, it } from 'vitest';
import { formatAmount } from '@intafaced/ledger-client/money';
import { createVenueMarketDataAdapter, PUBLIC_MARKET_DATA_VENUE_IDS } from './factory.js';
import { OkxSpotMarketData } from './okx-spot.js';
import { crossCheckMids } from '../cross-check.js';
import type { HttpPort, HttpResponse } from '../transport.js';

class FakeHttp implements HttpPort {
  readonly requests: string[] = [];
  constructor(private readonly body: unknown) {}
  async get(url: string): Promise<HttpResponse> {
    this.requests.push(url);
    return { status: 200, body: this.body, header: () => null };
  }
}

const thickBook = {
  code: '0',
  msg: '',
  data: [
    {
      asks: [['30002.00', '1.00', '0', '1']],
      bids: [['30000.00', '2.00', '0', '1']],
      ts: '1700000000000',
      seqId: 42,
    },
  ],
};

describe('createVenueMarketDataAdapter — a third id is what makes a median a check', () => {
  it('registers exactly the three public market-data venues, including okx-spot', () => {
    // Revert-proof: drop okx-spot from the list and this is red. Two venues
    // leave cross-check inconclusive (minVenues is 3).
    expect(PUBLIC_MARKET_DATA_VENUE_IDS).toEqual(['binance-spot', 'bybit-spot', 'okx-spot']);
    expect(new Set(PUBLIC_MARKET_DATA_VENUE_IDS).size).toBe(3);
  });

  it('builds each registered id as that venue, and refuses everything else', () => {
    for (const id of PUBLIC_MARKET_DATA_VENUE_IDS) {
      const adapter = createVenueMarketDataAdapter(id);
      expect(adapter).not.toBeNull();
      expect(adapter!.venue.id).toBe(id);
      expect(adapter!.venue.kind).toBe('external-cex');
      expect(adapter!.venue.sequencedDepth).toBe(true);
    }
    expect(createVenueMarketDataAdapter('okx-spot')).toBeInstanceOf(OkxSpotMarketData);
    expect(createVenueMarketDataAdapter('')).toBeNull();
    expect(createVenueMarketDataAdapter('off')).toBeNull();
    expect(createVenueMarketDataAdapter('none')).toBeNull();
    expect(createVenueMarketDataAdapter('false')).toBeNull();
    expect(createVenueMarketDataAdapter('not-a-venue')).toBeNull();
    expect(createVenueMarketDataAdapter('ccxt')).toBeNull();
  });

  it('reaches snapshotBook through the factory id, not only the concrete class', async () => {
    const http = new FakeHttp(thickBook);
    const adapter = createVenueMarketDataAdapter('okx-spot', { http, restBase: 'https://rest.test' });
    expect(adapter).not.toBeNull();
    const snapshot = await adapter!.snapshotBook('BTC/USDT', 100);
    expect(snapshot.venueId).toBe('okx-spot');
    expect(snapshot.sequence).toBe(42);
    expect(formatAmount(snapshot.bids[0]![0])).toBe('30000');
    expect(http.requests[0]).toContain('/api/v5/market/books?instId=BTC-USDT');
  });

  it('makes a three-venue median conclusive — two factory ids stay inconclusive', () => {
    const now = new Date('2026-08-14T00:00:00Z');
    const mid = (venueId: string, price: bigint) => ({ venueId, mid: price, observedAt: now });
    const scale = 10n ** 18n;
    const a = mid('binance-spot', 30_000n * scale);
    const b = mid('bybit-spot', 30_001n * scale);
    const c = mid('okx-spot', 29_999n * scale);
    expect(crossCheckMids('BTC/USDT', [a, b], { now }).verdict).toBe('inconclusive');
    expect(crossCheckMids('BTC/USDT', [a, b, c], { now }).verdict).toBe('consensus');
  });
});
