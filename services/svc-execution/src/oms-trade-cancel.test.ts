import { describe, expect, it } from 'vitest';
import { parseAmount, ZERO } from '@intafaced/ledger-client';
import type { TradeAdapter, VenueOrder } from '@intafaced/venue-contracts';
import { tradeAdapterCancel } from './oms-trade-cancel.js';

const now = new Date('2026-08-17T12:00:00.000Z');

function order(over: Partial<VenueOrder> = {}): VenueOrder {
  return {
    venueId: 'street',
    venueOrderId: 'v-1',
    clientOrderId: 'oms-street',
    symbol: 'BTC/USDT',
    side: 'buy',
    type: 'limit',
    price: parseAmount('100'),
    amount: parseAmount('1'),
    filled: ZERO,
    remaining: parseAmount('1'),
    averagePrice: null,
    status: 'canceled',
    feePaid: ZERO,
    feeAsset: 'USDT',
    createdAt: now,
    observedAt: now,
    ...over,
  };
}

function adapter(cancel: VenueOrder | (() => Promise<VenueOrder>)): TradeAdapter {
  return {
    venue: { id: 'street', displayName: 'Street', kind: 'external-cex', sequencedDepth: true },
    placeOrder: async () => order({ status: 'open' }),
    cancelOrder: async () => (typeof cancel === 'function' ? cancel() : cancel),
    fetchOrder: async () => order({ status: 'open' }),
    openOrders: async () => [],
  };
}

describe('tradeAdapterCancel', () => {
  it('forwards symbol + clientOrderId to TradeAdapter.cancelOrder', async () => {
    const seen: { symbol: string; clientOrderId: string }[] = [];
    const cancel = tradeAdapterCancel({
      ...adapter(order()),
      cancelOrder: async (symbol, clientOrderId) => {
        seen.push({ symbol, clientOrderId });
        return order();
      },
    });
    const result = await cancel('BTC/USDT', 'oms-street');
    expect(seen).toEqual([{ symbol: 'BTC/USDT', clientOrderId: 'oms-street' }]);
    expect(result.status).toBe('canceled');
  });

  it('throws on pending rather than inventing canceled', async () => {
    const cancel = tradeAdapterCancel(adapter(order({ status: 'pending', venueOrderId: null })));
    await expect(cancel('BTC/USDT', 'oms-street')).rejects.toThrow(/pending/);
  });

  it('returns a raced fill honestly — does not rewrite status to canceled', async () => {
    const cancel = tradeAdapterCancel(
      adapter(order({ status: 'filled', filled: parseAmount('1'), remaining: ZERO, averagePrice: parseAmount('100') })),
    );
    const result = await cancel('BTC/USDT', 'oms-street');
    expect(result.status).toBe('filled');
  });
});
