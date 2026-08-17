import { describe, expect, it } from 'vitest';
import { parseAmount, ZERO } from '@intafaced/ledger-client';
import type { TradeAdapter, VenueOrder } from '@intafaced/venue-contracts';
import { tradeAdapterOpenOrders } from './oms-trade-open-orders.js';

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

function adapter(listed: VenueOrder[]): TradeAdapter {
  return {
    venue: { id: 'street', displayName: 'Street', kind: 'external-cex', sequencedDepth: true },
    placeOrder: async () => order({ status: 'open' }),
    cancelOrder: async () => order({ status: 'canceled' }),
    fetchOrder: async () => order({ status: 'open' }),
    openOrders: async () => listed,
  };
}

describe('tradeAdapterOpenOrders', () => {
  it('forwards optional symbol to TradeAdapter.openOrders', async () => {
    const seen: (string | undefined)[] = [];
    const list = tradeAdapterOpenOrders({
      ...adapter([]),
      openOrders: async (symbol) => {
        seen.push(symbol);
        return [order()];
      },
    });
    const result = await list('BTC/USDT');
    expect(seen).toEqual(['BTC/USDT']);
    expect(result).toHaveLength(1);
    expect(result[0]!.status).toBe('open');
  });

  it('drops pending rather than rewriting them to open', async () => {
    const list = tradeAdapterOpenOrders(adapter([order(), order({ clientOrderId: 'p', status: 'pending', venueOrderId: null })]));
    const result = await list();
    expect(result.map((o) => o.clientOrderId)).toEqual(['oms-street']);
  });

  it('returns [] when the venue has no acknowledged opens', async () => {
    const list = tradeAdapterOpenOrders(adapter([order({ status: 'pending', venueOrderId: null })]));
    await expect(list()).resolves.toEqual([]);
  });

  it('filters by side without inventing the other', async () => {
    const list = tradeAdapterOpenOrders(adapter([order(), order({ clientOrderId: 'sell-1', venueOrderId: 'v-2', side: 'sell' })]));
    expect((await list(undefined, 'sell')).map((o) => o.clientOrderId)).toEqual(['sell-1']);
    expect(await list(undefined, 'buy')).toHaveLength(1);
    expect(await list()).toHaveLength(2);
  });

  it('filters by type without inventing the other', async () => {
    const list = tradeAdapterOpenOrders(
      adapter([order(), order({ clientOrderId: 'mkt-1', venueOrderId: 'v-3', type: 'market', price: null })]),
    );
    expect((await list(undefined, undefined, 'market')).map((o) => o.clientOrderId)).toEqual(['mkt-1']);
    expect(await list(undefined, undefined, 'limit')).toHaveLength(1);
    expect(await list()).toHaveLength(2);
  });

  it('filters by clientOrderId without inventing a row; pending still dropped', async () => {
    const list = tradeAdapterOpenOrders(
      adapter([
        order(),
        order({ clientOrderId: 'other', venueOrderId: 'v-4' }),
        order({ clientOrderId: 'p', status: 'pending', venueOrderId: null }),
      ]),
    );
    expect((await list(undefined, undefined, undefined, 'other')).map((o) => o.clientOrderId)).toEqual(['other']);
    expect(await list(undefined, undefined, undefined, 'p')).toEqual([]);
    expect(await list()).toHaveLength(2);
  });

  it('filters by venueOrderId without inventing a row; pending still dropped', async () => {
    const list = tradeAdapterOpenOrders(
      adapter([
        order(),
        order({ clientOrderId: 'other', venueOrderId: 'v-9' }),
        order({ clientOrderId: 'p', status: 'pending', venueOrderId: null }),
      ]),
    );
    expect((await list(undefined, undefined, undefined, undefined, 'v-9')).map((o) => o.venueOrderId)).toEqual(['v-9']);
    expect(await list(undefined, undefined, undefined, undefined, 'missing')).toEqual([]);
    expect(await list()).toHaveLength(2);
  });

  it('filters by feeAsset without inventing a row; pending still dropped', async () => {
    const list = tradeAdapterOpenOrders(
      adapter([
        order(),
        order({ clientOrderId: 'btc-fee', venueOrderId: 'v-8', feeAsset: 'BTC' }),
        order({ clientOrderId: 'p', status: 'pending', venueOrderId: null, feeAsset: 'USDT' }),
      ]),
    );
    expect((await list(undefined, undefined, undefined, undefined, undefined, 'BTC')).map((o) => o.clientOrderId)).toEqual(['btc-fee']);
    expect(await list(undefined, undefined, undefined, undefined, undefined, 'ETH')).toEqual([]);
    expect(await list()).toHaveLength(2);
    expect((await list())[0]?.feeAsset).toBe('USDT');
  });
});
