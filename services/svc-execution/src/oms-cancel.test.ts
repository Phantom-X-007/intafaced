import { describe, expect, it } from 'vitest';
import { parseAmount, ZERO } from '@intafaced/ledger-client';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { SealedHouseTenantRegistry } from '@intafaced/execution-house-tenant';
import type { VenueOrder } from '@intafaced/venue-contracts';
import { cancelOmsOrder, type OmsCancelFn } from './oms-cancel.js';
import { createExecutionRouter } from './router.js';

const SECRET = 'a-execution-oms-cancel-test-edge-secret';
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

function canceledOrder(over: Partial<VenueOrder> = {}): VenueOrder {
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

class FakeCancel {
  readonly calls: { symbol: string; clientOrderId: string }[] = [];
  constructor(
    private readonly next: VenueOrder | Error,
    readonly id = 'street',
  ) {}
  fn: OmsCancelFn = async (symbol, clientOrderId) => {
    this.calls.push({ symbol, clientOrderId });
    if (this.next instanceof Error) throw this.next;
    return this.next;
  };
}

describe('cancelOmsOrder', () => {
  it('cancels by client order id on the injected venue', async () => {
    const street = new FakeCancel(canceledOrder());
    const result = await cancelOmsOrder({
      venueId: 'street',
      symbol: 'BTC/USDT',
      clientOrderId: 'oms-street',
      cancelByVenue: { street: street.fn },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.order.status).toBe('canceled');
    expect(street.calls).toEqual([{ symbol: 'BTC/USDT', clientOrderId: 'oms-street' }]);
  });

  it('refuses internal venues and does not call cancel', async () => {
    const book = new FakeCancel(canceledOrder());
    const result = await cancelOmsOrder({
      venueId: 'book',
      symbol: 'BTC/USDT',
      clientOrderId: 'oms-book',
      kind: 'internal',
      cancelByVenue: { book: book.fn },
    });
    expect(result).toMatchObject({ ok: false, reason: 'internal_venue' });
    expect(book.calls).toHaveLength(0);
  });

  it('surfaces cancel throw as cancel_failed, never a canceled order', async () => {
    const street = new FakeCancel(new Error('venue 503'));
    const result = await cancelOmsOrder({
      venueId: 'street',
      symbol: 'BTC/USDT',
      clientOrderId: 'oms-street',
      cancelByVenue: { street: street.fn },
    });
    expect(result).toMatchObject({ ok: false, reason: 'cancel_failed', detail: 'venue 503' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect('order' in result).toBe(false);
  });

  it('returns a fill honestly when cancel raced the venue — does not invent canceled', async () => {
    const street = new FakeCancel(
      canceledOrder({ status: 'filled', filled: parseAmount('1'), remaining: ZERO, averagePrice: parseAmount('100') }),
    );
    const result = await cancelOmsOrder({
      venueId: 'street',
      symbol: 'BTC/USDT',
      clientOrderId: 'oms-street',
      cancelByVenue: { street: street.fn },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.order.status).toBe('filled');
  });

  it('refuses pending cancel acknowledgement', async () => {
    const street = new FakeCancel(canceledOrder({ status: 'pending', venueOrderId: null }));
    const result = await cancelOmsOrder({
      venueId: 'street',
      symbol: 'BTC/USDT',
      clientOrderId: 'oms-street',
      cancelByVenue: { street: street.fn },
    });
    expect(result).toMatchObject({ ok: false, reason: 'cancel_failed' });
  });

  it('missing injection is cancel_failed', async () => {
    const result = await cancelOmsOrder({
      venueId: 'street',
      symbol: 'BTC/USDT',
      clientOrderId: 'oms-street',
    });
    expect(result).toMatchObject({ ok: false, reason: 'cancel_failed', detail: 'no cancel injected for venue street' });
  });
});

describe('execution.oms.cancel tRPC', () => {
  it('refuses anonymous cancel', async () => {
    const router = createExecutionRouter(new SealedHouseTenantRegistry());
    const anon = edgeContext({ headers: { 'x-intafaced-region': 'DE' }, id: 'req-anon' });
    await expect(
      router.createCaller(anon).execution.oms.cancel({
        venueId: 'street',
        symbol: 'BTC/USDT',
        clientOrderId: 'oms-street',
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('cancels through the injected map', async () => {
    const street = new FakeCancel(canceledOrder());
    const caller = createExecutionRouter(new SealedHouseTenantRegistry(), {}, { street: street.fn }).createCaller(hmacSigned());
    const out = await caller.execution.oms.cancel({
      venueId: 'street',
      symbol: 'BTC/USDT',
      clientOrderId: 'oms-street',
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.order.status).toBe('canceled');
    expect(street.calls).toHaveLength(1);
  });
});
