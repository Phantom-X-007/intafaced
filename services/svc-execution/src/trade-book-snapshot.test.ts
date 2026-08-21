import { describe, expect, it } from 'vitest';
import { createTradeBookSnapshotFn, TRADE_BOOK_SNAPSHOT_VENUE_ID } from './trade-book-snapshot.js';

describe('createTradeBookSnapshotFn', () => {
  it('maps trade orderbook wire into VenueBookSnapshot', async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          symbol: 'BTC/USDT',
          bids: [['42000', '1.5']],
          asks: [['42001', '2']],
          timestamp: 1_700_000_000_000,
          datetime: '2023-11-14T22:13:20.000Z',
          nonce: 42,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );

    const snapshot = await createTradeBookSnapshotFn({
      tradeUrl: 'http://trade.test',
      fetchImpl: fetchImpl as typeof fetch,
    })('BTC/USDT', 50);

    expect(snapshot.venueId).toBe(TRADE_BOOK_SNAPSHOT_VENUE_ID);
    expect(snapshot.symbol).toBe('BTC/USDT');
    expect(snapshot.bids).toEqual([['42000', '1.5']]);
    expect(snapshot.asks).toEqual([['42001', '2']]);
    expect(snapshot.sequence).toBe(42);
    expect(snapshot.sequenced).toBe(true);
    expect(snapshot.observedAt).toBeInstanceOf(Date);
  });

  it('throws when trade is unreachable', async () => {
    const fn = createTradeBookSnapshotFn({
      tradeUrl: 'http://trade.test',
      fetchImpl: (async () => new Response('', { status: 502 })) as typeof fetch,
    });
    await expect(fn('BTC/USDT')).rejects.toThrow(/unreachable/);
  });
});
