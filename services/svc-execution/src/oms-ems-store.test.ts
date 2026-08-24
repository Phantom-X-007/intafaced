import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client';
import { InMemoryEmsOrderStore } from './oms-ems-store.js';

describe('InMemoryEmsOrderStore', () => {
  it('records and lists EMS acks by venue/symbol', () => {
    const store = new InMemoryEmsOrderStore();
    store.record({
      clientOrderId: 'oms-binance-spot',
      venueId: 'binance-spot',
      symbol: 'BTC/USDT',
      side: 'buy',
      execution: {
        venueId: 'binance-spot',
        venueOrderId: 'v-1',
        filledAmount: parseAmount('1'),
        averagePrice: parseAmount('100'),
        feeAmount: parseAmount('0'),
        feeAsset: 'USDT',
        status: 'filled',
        executedAt: new Date('2026-08-22T00:00:00.000Z'),
      },
      recordedAtMs: 1,
    });
    expect(store.get('oms-binance-spot')?.execution?.venueOrderId).toBe('v-1');
    expect(store.list({ venueId: 'binance-spot', symbol: 'BTC/USDT' })).toHaveLength(1);
    expect(store.list({ venueId: 'bybit-spot' })).toHaveLength(0);
  });
});
