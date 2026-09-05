import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount } from '@intafaced/ledger-client/money';
import { VenueUnavailableError, midFromSnapshot, type VenueBookSnapshot } from '@intafaced/venue-contracts';
import { CaptureLake, midFromCapture } from '../capture-lake.js';
import { SequencedBookTracker } from '../sequenced-book.js';
import { AsyncFrameQueue, type HttpPort, type HttpResponse, type StreamHandle, type StreamPort } from '../transport.js';
import { BinanceSpotMarketData } from './binance-spot.js';
import { createVenueMarketDataAdapter, publicVenueBookMid } from './factory.js';

/**
 * venue.aggregation pin: empty / unmapped / dark / unknown must return a
 * null mid — never invent a price. Phase A: existing Binance spot public
 * market-data adapter. No second venue. Trading half stays unbuilt.
 */

class FakeHttp implements HttpPort {
  readonly requests: string[] = [];
  #responses: HttpResponse[] = [];

  queue(body: unknown, status = 200, headers: Record<string, string> = {}): this {
    this.#responses.push({
      status,
      body,
      header: (name) => headers[name] ?? headers[name.toLowerCase()] ?? null,
    });
    return this;
  }

  async get(url: string): Promise<HttpResponse> {
    this.requests.push(url);
    const next = this.#responses.shift();
    if (!next) throw new Error(`FakeHttp had no queued response for ${url}`);
    return next;
  }
}

class FakeStream implements StreamPort {
  async open(): Promise<StreamHandle> {
    const queue = new AsyncFrameQueue<unknown>();
    return { messages: queue, close: async () => queue.close() };
  }
}

function adapter(http: FakeHttp) {
  return new BinanceSpotMarketData({
    http,
    stream: new FakeStream(),
    clock: () => 1_700_000_000_000,
    restBase: 'https://rest.test',
    wsBase: 'wss://ws.test',
  });
}

function thick(over: Partial<VenueBookSnapshot> = {}): VenueBookSnapshot {
  return {
    venueId: 'binance-spot',
    symbol: 'BTC/USDT',
    bids: [[parseAmount('30000'), parseAmount('2')]],
    asks: [[parseAmount('30002'), parseAmount('1')]],
    sequence: 1,
    sequenced: true,
    observedAt: new Date(0),
    ...over,
  };
}

function expectNullMid(mid: bigint | null): void {
  expect(mid).toBeNull();
  expect(typeof mid).not.toBe('bigint');
  expect(mid).not.toBe(0n);
}

describe('publicVenueBookMid — dark / unknown / unmapped / empty never invent a mid', () => {
  it('DARK venue (off / none / false / empty) stays null even with a thick book', () => {
    const book = thick();
    expect(formatAmount(midFromSnapshot(book)!)).toBe('30001');
    expectNullMid(publicVenueBookMid('', 'BTC/USDT', book));
    expectNullMid(publicVenueBookMid('off', 'BTC/USDT', book));
    expectNullMid(publicVenueBookMid('none', 'BTC/USDT', book));
    expectNullMid(publicVenueBookMid('false', 'BTC/USDT', book));
    expect(createVenueMarketDataAdapter('off')).toBeNull();
  });

  it('UNKNOWN venue id stays null even with a thick book', () => {
    const book = thick();
    expectNullMid(publicVenueBookMid('not-a-venue', 'BTC/USDT', book));
    expectNullMid(publicVenueBookMid('ccxt', 'BTC/USDT', book));
    expect(createVenueMarketDataAdapter('kraken-spot')).toBeNull();
  });

  it('UNMAPPED market spelling (venue-native, not unified) stays null', () => {
    expectNullMid(publicVenueBookMid('binance-spot', 'BTCUSDT', thick({ symbol: 'BTCUSDT' })));
    expectNullMid(publicVenueBookMid('binance-spot', 'BTCUSDT', thick()));
  });

  it('EMPTY and one-sided books stay null — never zero-as-price', () => {
    expectNullMid(publicVenueBookMid('binance-spot', 'BTC/USDT', thick({ bids: [], asks: [] })));
    expectNullMid(publicVenueBookMid('binance-spot', 'BTC/USDT', thick({ asks: [] })));
    expectNullMid(publicVenueBookMid('binance-spot', 'BTC/USDT', null));
    expectNullMid(publicVenueBookMid('binance-spot', 'BTC/USDT', undefined));
  });

  it('a mapped two-sided Binance book still has a mid — the refuse is the hole, not the adapter', () => {
    const mid = publicVenueBookMid('binance-spot', 'BTC/USDT', thick());
    expect(mid).not.toBeNull();
    expect(formatAmount(mid!)).toBe('30001');
  });
});

describe('BinanceSpotMarketData — empty / unknown market cannot become a number mid', () => {
  it('empty REST book snapshots as absence; mid is null', async () => {
    const http = new FakeHttp().queue({ lastUpdateId: 9, bids: [], asks: [] });
    const snapshot = await adapter(http).snapshotBook('BTC/USDT', 5);
    expect(snapshot.bids).toEqual([]);
    expect(snapshot.asks).toEqual([]);
    expectNullMid(midFromSnapshot(snapshot));
    expectNullMid(publicVenueBookMid('binance-spot', 'BTC/USDT', snapshot));
  });

  it('unknown symbol is refused as unreachable, not served as an empty book with a mid', async () => {
    const http = new FakeHttp().queue(null, 400);
    const md = adapter(http);
    await expect(md.snapshotBook('NOPE/USDT', 5)).rejects.toBeInstanceOf(VenueUnavailableError);
    expectNullMid(publicVenueBookMid('binance-spot', 'NOPE/USDT', null));
  });
});

describe('capture + desynced tracker — absence is null mid, not a quiet last-price', () => {
  it('a capture hole has a null mid', async () => {
    const lake = new CaptureLake({ now: () => new Date(0) });
    const hole = await lake.captureBook(null, 'binance-spot', 'BTC/USDT');
    expectNullMid(midFromCapture(hole));
  });

  it('a connected empty book is a quiet-market fact with a null mid', async () => {
    const lake = new CaptureLake({ now: () => new Date(0) });
    const empty = thick({ bids: [], asks: [] });
    const record = lake.recordBook(empty);
    expectNullMid(midFromCapture(record));
  });

  it('a desynced sequenced book withholds top — no mid to invent from', () => {
    const tracker = new SequencedBookTracker('binance-spot', 'BTC/USDT');
    tracker.onSnapshot(thick({ sequence: 100 }));
    expect(formatAmount(tracker.top()!.mid!)).toBe('30001');
    tracker.onDelta({
      venueId: 'binance-spot',
      symbol: 'BTC/USDT',
      sequence: { firstSequence: 102, lastSequence: 102 },
      bids: [],
      asks: [],
      observedAt: new Date(0),
    });
    expect(tracker.servable).toBe(false);
    expect(tracker.top()).toBeNull();
  });
});
