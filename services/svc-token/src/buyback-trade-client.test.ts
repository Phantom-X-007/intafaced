import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseAmount as amt } from '@intafaced/ledger-client';
import { createTradeIocMarketBuy } from './buyback-trade-client.js';

const SECRET = 'test-internal-secret-for-buyback-place';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createTradeIocMarketBuy', () => {
  it('unset symbol refuses — never invents a listing or a fill', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const place = createTradeIocMarketBuy({ tradeUrl: 'http://trade.test', symbol: '', internalSecret: SECRET });
    await expect(place({ quoteBudget: amt('50'), clientOrderId: 'run-1' })).rejects.toMatchObject({
      code: 'token.buyback_job_unset',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('empty asks → filledQty 0 and never POSTs a placeOrder', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(String(url)).toContain('/api/v1/orderbook/');
      return { ok: true, json: async () => ({ asks: [] }) };
    });
    vi.stubGlobal('fetch', fetchMock);
    const place = createTradeIocMarketBuy({ tradeUrl: 'http://trade.test', symbol: 'IFC/USDT', internalSecret: SECRET });
    await expect(place({ quoteBudget: amt('50'), clientOrderId: 'run-1' })).resolves.toEqual({ filledQty: 0n });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('non-empty book POSTs IOC market-buy; filled is the order figure not the sized qty', async () => {
    const fetchMock = vi.fn(async (url: string, init?: { method?: string }) => {
      if (String(url).includes('/orderbook/')) {
        return { ok: true, json: async () => ({ asks: [['2', '100']] }) };
      }
      expect(init?.method).toBe('POST');
      expect(String(url)).toContain('/api/v1/orders');
      const body = JSON.parse(String((init as { body: string }).body)) as { type: string; side: string; timeInForce: string };
      expect(body).toMatchObject({ type: 'market', side: 'buy', timeInForce: 'IOC' });
      return { ok: true, json: async () => ({ filled: '7' }) };
    });
    vi.stubGlobal('fetch', fetchMock);
    const place = createTradeIocMarketBuy({ tradeUrl: 'http://trade.test', symbol: 'IFC/USDT', internalSecret: SECRET });
    const result = await place({ quoteBudget: amt('50'), clientOrderId: 'run-1' });
    expect(result.filledQty).toBe(amt('7'));
    expect(result.filledQty).not.toBe(amt('50'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('deleting placeOrder (orderbook only) must not invent a fill from depth', async () => {
    const fetchMock = vi.fn(async (url: string, init?: { method?: string }) => {
      if (String(url).includes('/orderbook/')) {
        return { ok: true, json: async () => ({ asks: [['2', '100']] }) };
      }
      expect(init?.method).toBe('POST');
      return { ok: false, status: 401, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);
    const place = createTradeIocMarketBuy({ tradeUrl: 'http://trade.test', symbol: 'IFC/USDT', internalSecret: SECRET });
    await expect(place({ quoteBudget: amt('50'), clientOrderId: 'run-1' })).rejects.toMatchObject({
      code: 'token.buyback_job_unset',
    });
  });
});
