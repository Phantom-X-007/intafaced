import { describe, expect, it } from 'vitest';
import { parseAmount, ZERO } from '@intafaced/ledger-client';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { SealedHouseTenantRegistry } from '@intafaced/execution-house-tenant';
import type { VenueOrder } from '@intafaced/venue-contracts';
import { listOmsOpenOrders, type OmsOpenOrdersFn, type OmsOpenOrdersStatus } from './oms-open-orders.js';
import { createExecutionRouter } from './router.js';

const SECRET = 'a-execution-oms-open-orders-test-edge-secret';
const OP = '33333333-3333-4333-8333-333333333333';
const edgeContext = createEdgeContext({ secret: SECRET, serviceName: 'svc-execution' });
const now = new Date('2026-08-17T00:00:00.000Z');

function principal(overrides: Partial<Principal> = {}): Principal {
  return {
    sub: OP,
    userId: OP,
    sid: '22222222-2222-4222-8222-222222222222',
    scopes: ['admin:read', 'admin:write'],
    tier: 'none',
    mfa: false,
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  } as Principal;
}

function signed(p: Principal = principal()) {
  const raw = encodePrincipal(p);
  return edgeContext({
    headers: {
      'x-intafaced-principal': raw,
      'x-intafaced-principal-sig': signPrincipalHeader(raw, SECRET, 'DE'),
      'x-intafaced-region': 'DE',
    },
    id: 'req-signed',
  });
}

function hmacSigned(p: Principal = principal()) {
  return { ...signed(p), service: 'svc-execution' as const };
}

function openOrder(over: Partial<VenueOrder> = {}): VenueOrder {
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

class FakeOpenOrders {
  readonly calls: Array<{
    symbol?: string;
    side?: 'buy' | 'sell';
    type?: 'limit' | 'market';
    clientOrderId?: string;
    venueOrderId?: string;
    feeAsset?: string;
    status?: OmsOpenOrdersStatus;
  }> = [];
  constructor(private readonly next: VenueOrder[] | Error) {}
  fn: OmsOpenOrdersFn = async (symbol, side, type, clientOrderId, venueOrderId, feeAsset, status) => {
    this.calls.push({ symbol, side, type, clientOrderId, venueOrderId, feeAsset, status });
    if (this.next instanceof Error) throw this.next;
    return this.next;
  };
}

describe('listOmsOpenOrders', () => {
  it('lists acknowledged opens on the injected venue', async () => {
    const street = new FakeOpenOrders([openOrder()]);
    const result = await listOmsOpenOrders({
      venueId: 'street',
      symbol: 'BTC/USDT',
      openOrdersByVenue: { street: street.fn },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.orders).toHaveLength(1);
    expect(result.orders[0]!.status).toBe('open');
    expect(street.calls).toEqual([
      {
        symbol: 'BTC/USDT',
        side: undefined,
        type: undefined,
        clientOrderId: undefined,
        venueOrderId: undefined,
        feeAsset: undefined,
        status: undefined,
      },
    ]);
  });

  it('passes an optional side through and does not invent the other', async () => {
    const street = new FakeOpenOrders([openOrder({ side: 'sell' })]);
    const result = await listOmsOpenOrders({
      venueId: 'street',
      side: 'sell',
      openOrdersByVenue: { street: street.fn },
    });
    expect(result.ok).toBe(true);
    expect(street.calls).toEqual([
      {
        symbol: undefined,
        side: 'sell',
        type: undefined,
        clientOrderId: undefined,
        venueOrderId: undefined,
        feeAsset: undefined,
        status: undefined,
      },
    ]);
    if (!result.ok) return;
    expect(result.orders[0]?.side).toBe('sell');
  });

  it('passes an optional type through and does not invent the other', async () => {
    const street = new FakeOpenOrders([openOrder({ type: 'market', price: null })]);
    const result = await listOmsOpenOrders({
      venueId: 'street',
      type: 'market',
      openOrdersByVenue: { street: street.fn },
    });
    expect(result.ok).toBe(true);
    expect(street.calls).toEqual([
      {
        symbol: undefined,
        side: undefined,
        type: 'market',
        clientOrderId: undefined,
        venueOrderId: undefined,
        feeAsset: undefined,
        status: undefined,
      },
    ]);
    if (!result.ok) return;
    expect(result.orders[0]?.type).toBe('market');
  });

  it('passes an optional clientOrderId through and still drops pending', async () => {
    const street = new FakeOpenOrders([openOrder({ clientOrderId: 'oms-street' })]);
    const result = await listOmsOpenOrders({
      venueId: 'street',
      clientOrderId: 'oms-street',
      openOrdersByVenue: { street: street.fn },
    });
    expect(result.ok).toBe(true);
    expect(street.calls).toEqual([
      {
        symbol: undefined,
        side: undefined,
        type: undefined,
        clientOrderId: 'oms-street',
        venueOrderId: undefined,
        feeAsset: undefined,
        status: undefined,
      },
    ]);
    if (!result.ok) return;
    expect(result.orders[0]?.clientOrderId).toBe('oms-street');
  });

  it('passes an optional venueOrderId through and still drops pending', async () => {
    const street = new FakeOpenOrders([openOrder({ venueOrderId: 'v-1' })]);
    const result = await listOmsOpenOrders({
      venueId: 'street',
      venueOrderId: 'v-1',
      openOrdersByVenue: { street: street.fn },
    });
    expect(result.ok).toBe(true);
    expect(street.calls).toEqual([
      {
        symbol: undefined,
        side: undefined,
        type: undefined,
        clientOrderId: undefined,
        venueOrderId: 'v-1',
        feeAsset: undefined,
        status: undefined,
      },
    ]);
    if (!result.ok) return;
    expect(result.orders[0]?.venueOrderId).toBe('v-1');
  });

  it('passes an optional feeAsset through and still drops pending', async () => {
    const street = new FakeOpenOrders([openOrder({ feeAsset: 'USDT' })]);
    const result = await listOmsOpenOrders({
      venueId: 'street',
      feeAsset: 'USDT',
      openOrdersByVenue: { street: street.fn },
    });
    expect(result.ok).toBe(true);
    expect(street.calls).toEqual([
      {
        symbol: undefined,
        side: undefined,
        type: undefined,
        clientOrderId: undefined,
        venueOrderId: undefined,
        feeAsset: 'USDT',
        status: undefined,
      },
    ]);
    if (!result.ok) return;
    expect(result.orders[0]?.feeAsset).toBe('USDT');
  });

  it('omitted status lists every acknowledged open after dropping pending', async () => {
    const street = new FakeOpenOrders([
      openOrder(),
      openOrder({ clientOrderId: 'partial', status: 'partially_filled', venueOrderId: 'v-2' }),
      openOrder({ clientOrderId: 'pending-1', status: 'pending', venueOrderId: null }),
    ]);
    const result = await listOmsOpenOrders({
      venueId: 'street',
      openOrdersByVenue: { street: street.fn },
    });
    expect(result.ok).toBe(true);
    expect(street.calls).toEqual([
      {
        symbol: undefined,
        side: undefined,
        type: undefined,
        clientOrderId: undefined,
        venueOrderId: undefined,
        feeAsset: undefined,
        status: undefined,
      },
    ]);
    if (!result.ok) return;
    expect(result.orders.map((o) => o.clientOrderId)).toEqual(['oms-street', 'partial']);
  });

  it('passes an optional status through, exact-matches after dropping pending', async () => {
    const street = new FakeOpenOrders([
      openOrder(),
      openOrder({ clientOrderId: 'partial', status: 'partially_filled', venueOrderId: 'v-2' }),
      openOrder({ clientOrderId: 'pending-1', status: 'pending', venueOrderId: null }),
    ]);
    const result = await listOmsOpenOrders({
      venueId: 'street',
      status: 'open',
      openOrdersByVenue: { street: street.fn },
    });
    expect(result.ok).toBe(true);
    expect(street.calls).toEqual([
      {
        symbol: undefined,
        side: undefined,
        type: undefined,
        clientOrderId: undefined,
        venueOrderId: undefined,
        feeAsset: undefined,
        status: 'open',
      },
    ]);
    if (!result.ok) return;
    expect(result.orders.map((o) => o.clientOrderId)).toEqual(['oms-street']);
  });

  it('refuses internal venues and does not call the list', async () => {
    const book = new FakeOpenOrders([openOrder()]);
    const result = await listOmsOpenOrders({
      venueId: 'book',
      kind: 'internal',
      openOrdersByVenue: { book: book.fn },
    });
    expect(result).toMatchObject({ ok: false, reason: 'internal_venue' });
    expect(book.calls).toHaveLength(0);
  });

  it('surfaces list throw as list_failed, never an invented book', async () => {
    const street = new FakeOpenOrders(new Error('venue 503'));
    const result = await listOmsOpenOrders({
      venueId: 'street',
      openOrdersByVenue: { street: street.fn },
    });
    expect(result).toMatchObject({ ok: false, reason: 'list_failed', detail: 'venue 503' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect('orders' in result).toBe(false);
  });

  it('drops pending rows instead of rewriting them to open', async () => {
    const street = new FakeOpenOrders([openOrder(), openOrder({ clientOrderId: 'pending-1', status: 'pending', venueOrderId: null })]);
    const result = await listOmsOpenOrders({
      venueId: 'street',
      openOrdersByVenue: { street: street.fn },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.orders.map((o) => o.clientOrderId)).toEqual(['oms-street']);
  });

  it('missing injection is list_failed', async () => {
    const result = await listOmsOpenOrders({ venueId: 'street' });
    expect(result).toMatchObject({
      ok: false,
      reason: 'list_failed',
      detail: 'no open-orders list injected for venue street',
    });
  });
});

describe('execution.oms.openOrders tRPC', () => {
  it('refuses anonymous list', async () => {
    const router = createExecutionRouter(new SealedHouseTenantRegistry());
    const anon = edgeContext({ headers: { 'x-intafaced-region': 'DE' }, id: 'req-anon' });
    await expect(router.createCaller(anon).execution.oms.openOrders({ venueId: 'street' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('lists through the injected map', async () => {
    const street = new FakeOpenOrders([openOrder()]);
    const caller = createExecutionRouter(new SealedHouseTenantRegistry(), {}, {}, {}, { street: street.fn }).createCaller(hmacSigned());
    const out = await caller.execution.oms.openOrders({
      venueId: 'street',
      symbol: 'BTC/USDT',
      side: 'buy',
      type: 'limit',
      clientOrderId: 'oms-street',
      venueOrderId: 'v-1',
      feeAsset: 'USDT',
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.orders).toHaveLength(1);
    expect(street.calls).toEqual([
      {
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'limit',
        clientOrderId: 'oms-street',
        venueOrderId: 'v-1',
        feeAsset: 'USDT',
        status: undefined,
      },
    ]);
  });

  it('forwards optional status through tRPC and still drops pending', async () => {
    const street = new FakeOpenOrders([
      openOrder({ status: 'partially_filled' }),
      openOrder({ clientOrderId: 'pending-1', status: 'pending', venueOrderId: null }),
    ]);
    const caller = createExecutionRouter(new SealedHouseTenantRegistry(), {}, {}, {}, { street: street.fn }).createCaller(hmacSigned());
    const out = await caller.execution.oms.openOrders({
      venueId: 'street',
      status: 'partially_filled',
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.orders).toHaveLength(1);
    expect(out.orders[0]?.status).toBe('partially_filled');
    expect(street.calls).toEqual([
      {
        symbol: undefined,
        side: undefined,
        type: undefined,
        clientOrderId: undefined,
        venueOrderId: undefined,
        feeAsset: undefined,
        status: 'partially_filled',
      },
    ]);
  });
});
