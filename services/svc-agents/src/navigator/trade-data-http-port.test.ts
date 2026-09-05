import { describe, expect, it } from 'vitest';
import { createHttpNavigatorTradeDataPort, navigatorMarketIdToSymbol, symbolToNavigatorMarketId } from './trade-data-http-port.js';

describe('symbolToNavigatorMarketId', () => {
  it('lowercases and dashes CCXT symbols', () => {
    expect(symbolToNavigatorMarketId('BTC/USDT')).toBe('btc-usdt');
  });
});

describe('navigatorMarketIdToSymbol', () => {
  it('reverses navigator market ids', () => {
    expect(navigatorMarketIdToSymbol('btc-usdt')).toBe('BTC/USDT');
  });
});

describe('createHttpNavigatorTradeDataPort', () => {
  it('maps trade markets and ticker into navigator fixtures', async () => {
    const calls: { url: string; method: string }[] = [];
    const fetchImpl = async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? 'GET' });
      if (url.endsWith('/api/v1/markets')) {
        return new Response(
          JSON.stringify([
            {
              id: 'm-btc-usdt',
              symbol: 'BTC/USDT',
              active: true,
              sessionOpen: true,
            },
          ]),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.includes('/api/v1/ticker/BTC%2FUSDT')) {
        return new Response(
          JSON.stringify({
            symbol: 'BTC/USDT',
            timestamp: 1_700_000_000_000,
            datetime: '2023-11-14T22:13:20.000Z',
            last: '42000.5',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`unexpected url ${url}`);
    };

    const port = createHttpNavigatorTradeDataPort({
      tradeUrl: 'http://trade.test',
      maxAgeMs: 30_000,
      fetchImpl: fetchImpl as typeof fetch,
    });

    const markets = await port.listMarkets();
    expect(markets).toEqual([{ marketId: 'btc-usdt', symbol: 'BTC/USDT', status: 'open' }]);

    const quote = await port.quote('btc-usdt');
    expect(quote).toMatchObject({
      marketId: 'btc-usdt',
      last: '42000.5',
      asOf: '2023-11-14T22:13:20.000Z',
      maxAgeMs: 30_000,
    });

    expect(calls.every((c) => c.method === 'GET')).toBe(true);
    expect(calls.some((c) => /order|cancel|withdraw/i.test(c.url))).toBe(false);
  });
});
