import { describe, expect, it } from 'vitest';
import { HttpTradeCancelPort } from './cod-cancel.js';

describe('HttpTradeCancelPort', () => {
  it('maps 200 order list to reached ids', async () => {
    const port = new HttpTradeCancelPort({
      baseUrl: 'http://trade.test',
      fetch: async (input) => {
        expect(String(input)).toBe('http://trade.test/api/v1/orders');
        return new Response(JSON.stringify([{ id: 'o1' }, { orderId: 'o2' }]), { status: 200 });
      },
    });
    await expect(port.cancelAll({ accessToken: 'tok' })).resolves.toEqual({
      reached: true,
      status: 200,
      orders: [{ orderId: 'o1' }, { orderId: 'o2' }],
    });
  });

  it('network failure is not an invented empty cancel set', async () => {
    const port = new HttpTradeCancelPort({
      baseUrl: 'http://trade.test',
      fetch: async () => {
        throw new Error('down');
      },
    });
    await expect(port.cancelAll({ accessToken: 'tok' })).resolves.toEqual({
      reached: false,
      reason: 'cod.trade_not_reached',
    });
  });

  it('forwards market scope as symbol without claiming success on 503', async () => {
    const port = new HttpTradeCancelPort({
      baseUrl: 'http://trade.test',
      fetch: async (input) => {
        expect(String(input)).toContain('symbol=BTC-USDT');
        return new Response('no', { status: 503 });
      },
    });
    await expect(port.cancelAll({ accessToken: 'tok', marketId: 'BTC-USDT' })).resolves.toEqual({
      reached: true,
      status: 503,
      orders: [],
    });
  });
});
