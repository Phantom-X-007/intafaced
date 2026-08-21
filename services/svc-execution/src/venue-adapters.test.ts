import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { parseAmount, ZERO } from '@intafaced/ledger-client';
import { createVenueTradeAdapter } from '@intafaced/venue-adapter';
import {
  assertTradeOnly,
  VenueCredentialScopeError,
  VenueCredentialsMissingError,
  type TradeAdapter,
  type VenueCredentials,
  type VenueOrder,
} from '@intafaced/venue-contracts';
import {
  buildExecutionVenueTradeMaps,
  ExecutionVenueCredentialsUnsetError,
  ExecutionVenueUnknownError,
  executionVenueCredentialEnvPrefix,
  loadExecutionVenueCredentials,
  parseExecutionVenueIds,
  wireExecutionVenueTradeAdapter,
} from './venue-adapters.js';

const now = new Date('2026-08-17T12:00:00.000Z');

function order(over: Partial<VenueOrder> = {}): VenueOrder {
  return {
    venueId: 'binance-spot',
    venueOrderId: 'v-1',
    clientOrderId: 'oms-street',
    symbol: 'BTC/USDT',
    side: 'buy',
    type: 'limit',
    price: parseAmount('100'),
    amount: parseAmount('1'),
    filled: parseAmount('1'),
    remaining: ZERO,
    averagePrice: parseAmount('100'),
    status: 'filled',
    feePaid: ZERO,
    feeAsset: 'USDT',
    createdAt: now,
    observedAt: now,
    ...over,
  };
}

function fakeTradeAdapter(id = 'binance-spot'): TradeAdapter {
  return {
    venue: { id, displayName: id, kind: 'external-cex', sequencedDepth: true },
    placeOrder: async () => order({ venueId: id }),
    cancelOrder: async () => order({ venueId: id, status: 'canceled', filled: ZERO, remaining: parseAmount('1') }),
    fetchOrder: async () => order({ venueId: id }),
    openOrders: async () => [order({ venueId: id, status: 'open', filled: ZERO, remaining: parseAmount('1') })],
  };
}

const tradeOnly = (venueId: string): VenueCredentials => ({
  venueId,
  apiKey: 'k',
  apiSecret: 's',
  scopes: ['read', 'trade'],
});

describe('parseExecutionVenueIds', () => {
  it('splits comma list, normalizes, and treats off tokens as empty', () => {
    expect(parseExecutionVenueIds('binance-spot, bybit-spot ,okx-spot')).toEqual(['binance-spot', 'bybit-spot', 'okx-spot']);
    expect(parseExecutionVenueIds('')).toEqual([]);
    expect(parseExecutionVenueIds('off')).toEqual([]);
    expect(parseExecutionVenueIds('none')).toEqual([]);
    expect(parseExecutionVenueIds('false')).toEqual([]);
  });
});

describe('loadExecutionVenueCredentials', () => {
  const prefix = executionVenueCredentialEnvPrefix('binance-spot');

  beforeEach(() => {
    delete process.env[`${prefix}_API_KEY`];
    delete process.env[`${prefix}_API_SECRET`];
    delete process.env[`${prefix}_PASSPHRASE`];
  });

  afterEach(() => {
    delete process.env[`${prefix}_API_KEY`];
    delete process.env[`${prefix}_API_SECRET`];
    delete process.env[`${prefix}_PASSPHRASE`];
  });

  it('returns null when key or secret blank — refuse-closed, no invent', () => {
    expect(loadExecutionVenueCredentials('binance-spot')).toBeNull();
    process.env[`${prefix}_API_KEY`] = 'k';
    expect(loadExecutionVenueCredentials('binance-spot')).toBeNull();
  });

  it('loads trade-only credentials from per-venue env', () => {
    process.env[`${prefix}_API_KEY`] = 'key-1';
    process.env[`${prefix}_API_SECRET`] = 'secret-1';
    const creds = loadExecutionVenueCredentials('binance-spot');
    expect(creds?.apiKey).toBe('key-1');
    expect(creds?.scopes).toEqual(['read', 'trade']);
  });

  it('refuses withdrawal-capable scopes at load', () => {
    expect(() =>
      buildExecutionVenueTradeMaps(['bybit-spot'], {
        credentialsFor: () => ({ venueId: 'bybit-spot', apiKey: 'k', apiSecret: 's', scopes: ['trade', 'withdraw'] }),
        createAdapter: ((id, creds) => {
          if (creds) assertTradeOnly(creds);
          return fakeTradeAdapter(id);
        }) as typeof createVenueTradeAdapter,
      }),
    ).toThrow(VenueCredentialScopeError);
  });
});

describe('buildExecutionVenueTradeMaps', () => {
  it('wires known venues and skips unknown ids', () => {
    const maps = buildExecutionVenueTradeMaps(['binance-spot', 'kraken-spot'], {
      credentialsFor: () => tradeOnly('binance-spot'),
      createAdapter: ((id) => (id === 'binance-spot' ? fakeTradeAdapter(id) : null)) as typeof createVenueTradeAdapter,
    });
    expect(maps.wiredVenueIds).toEqual(['binance-spot']);
    expect(maps.submitByVenue['kraken-spot']).toBeUndefined();
  });

  it('submit/cancel/fetch/openOrders forward to injected fake adapter', async () => {
    const maps = buildExecutionVenueTradeMaps(['binance-spot'], {
      credentialsFor: () => tradeOnly('binance-spot'),
      createAdapter: ((id) => fakeTradeAdapter(id)) as typeof createVenueTradeAdapter,
    });
    const submit = await maps.submitByVenue['binance-spot']!({
      symbol: 'BTC/USDT',
      side: 'buy',
      amount: parseAmount('1'),
      limitPrice: parseAmount('100'),
      clientOrderId: 'c1',
    });
    expect(submit.status).toBe('filled');

    const canceled = await maps.cancelByVenue['binance-spot']!('BTC/USDT', 'c1');
    expect(canceled.status).toBe('canceled');

    const fetched = await maps.fetchByVenue['binance-spot']!('BTC/USDT', 'c1');
    expect(fetched.status).toBe('filled');

    const opens = await maps.openOrdersByVenue['binance-spot']!('BTC/USDT', 'buy', 'limit');
    expect(opens).toHaveLength(1);
    expect(opens[0]!.status).toBe('open');
  });

  it('missing credentials throw on use, not at map build', async () => {
    const maps = buildExecutionVenueTradeMaps(['binance-spot'], {
      credentialsFor: () => null,
      createAdapter: ((id, creds) => createVenueTradeAdapter(id, creds)) as typeof createVenueTradeAdapter,
    });
    await expect(
      maps.submitByVenue['binance-spot']!({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: parseAmount('1'),
        limitPrice: parseAmount('100'),
        clientOrderId: 'c1',
      }),
    ).rejects.toBeInstanceOf(VenueCredentialsMissingError);
  });
});
