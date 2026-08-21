import { describe, expect, it } from 'vitest';
import { parseAmount, ZERO } from '@intafaced/ledger-client';
import type { TradeAdapter, VenueOrder } from '@intafaced/venue-contracts';
import { tradeAdapterFetch } from './oms-trade-fetch.js';

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
    status: 'open',
    feePaid: ZERO,
    feeAsset: 'USDT',
    createdAt: now,
    observedAt: now,
    ...over,
  };
}

function adapter(fetched: VenueOrder | (() => Promise<VenueOrder>)): TradeAdapter {
  return {
    venue: { id: 'street', displayName: 'Street', kind: 'external-cex', sequencedDepth: true },
    placeOrder: async () => order({ status: 'open' }),
    cancelOrder: async () => order({ status: 'canceled' }),
    fetchOrder: async () => (typeof fetched === 'function' ? fetched() : fetched),
    openOrders: async () => [],
  };
}

describe('tradeAdapterFetch', () => {
  it('forwards symbol + clientOrderId to TradeAdapter.fetchOrder', async () => {
    const seen: { symbol: string; clientOrderId: string }[] = [];
    const fetchOrder = tradeAdapterFetch({
      ...adapter(order()),
      fetchOrder: async (symbol, clientOrderId) => {
        seen.push({ symbol, clientOrderId });
        return order();
      },
    });
    const result = await fetchOrder('BTC/USDT', 'oms-street');
    expect(seen).toEqual([{ symbol: 'BTC/USDT', clientOrderId: 'oms-street' }]);
    expect(result.status).toBe('open');
  });

  it('throws on pending rather than inventing an acknowledgement', async () => {
    const fetchOrder = tradeAdapterFetch(adapter(order({ status: 'pending', venueOrderId: null })));
    await expect(fetchOrder('BTC/USDT', 'oms-street')).rejects.toThrow(/pending/);
  });

  it('returns a raced fill honestly — does not rewrite status to open', async () => {
    const fetchOrder = tradeAdapterFetch(
      adapter(order({ status: 'filled', filled: parseAmount('1'), remaining: ZERO, averagePrice: parseAmount('100') })),
    );
    const result = await fetchOrder('BTC/USDT', 'oms-street');
    expect(result.status).toBe('filled');
  });
});
