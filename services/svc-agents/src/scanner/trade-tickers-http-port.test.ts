import { describe, expect, it } from 'vitest';
import { createHttpSpotTickersPort, symbolToScannerMarketId } from './trade-tickers-http-port.js';

describe('symbolToScannerMarketId', () => {
  it('lowercases and dashes CCXT symbols', () => {
    expect(symbolToScannerMarketId('BTC/USDT')).toBe('btc-usdt');
  });
});

describe('createHttpSpotTickersPort', () => {
  it('maps trade tickers record into scanner fixtures', async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          'BTC/USDT': {
            symbol: 'BTC/USDT',
            timestamp: 1_700_000_000_000,
            datetime: '2023-11-14T22:13:20.000Z',
            high: null,
            low: null,
            bid: '42000',
            bidVolume: null,
            ask: '42001',
            askVolume: null,
            vwap: null,
            open: null,
            close: null,
            last: '42000.5',
            previousClose: null,
            change: null,
            percentage: '1.25',
            average: null,
            baseVolume: null,
            quoteVolume: '1000000',
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );

    const port = createHttpSpotTickersPort({
      tradeUrl: 'http://trade.test',
      maxAgeMs: 30_000,
      fetchImpl: fetchImpl as typeof fetch,
    });
    const tickers = await port.sample();
    expect(tickers).toHaveLength(1);
    expect(tickers[0]).toMatchObject({
      marketId: 'btc-usdt',
      last: '42000.5',
      volume24h: '1000000',
      change24hBps: 125,
      maxAgeMs: 30_000,
    });
  });

  it('throws when trade is unreachable', async () => {
    const port = createHttpSpotTickersPort({
      tradeUrl: 'http://trade.test',
      fetchImpl: (async () => new Response('', { status: 502 })) as typeof fetch,
    });
    await expect(port.sample()).rejects.toThrow(/unreachable/);
  });
});
