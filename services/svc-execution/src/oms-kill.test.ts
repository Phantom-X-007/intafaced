import { describe, expect, it } from 'vitest';
import { parseAmount, ZERO } from '@intafaced/ledger-client';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { SealedHouseTenantRegistry } from '@intafaced/execution-house-tenant';
import type { VenueOrder } from '@intafaced/venue-contracts';
import type { OmsCancelFn } from './oms-cancel.js';
import { InMemoryEmsOrderStore } from './oms-ems-store.js';
import { killInFlightExecution } from './oms-kill.js';
import { createExecutionRouter } from './router.js';

const SECRET = 'a-execution-oms-kill-test-edge-secret';
const OP = '33333333-3333-4333-8333-333333333333';
const edgeContext = createEdgeContext({ secret: SECRET, serviceName: 'svc-execution' });
const now = new Date('2026-08-25T00:00:00.000Z');

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

function venueOrder(over: Partial<VenueOrder> = {}): VenueOrder {
  return {
    venueId: 'street',
    venueOrderId: 'v-1',
    clientOrderId: 'child-1',
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

function seedAck(
  store: InMemoryEmsOrderStore,
  over: {
    clientOrderId?: string;
    account?: string;
    session?: string;
    venueId?: string;
    state?: 'ACKNOWLEDGED' | 'REJECTED' | 'UNWIRED' | 'SUBMIT_UNKNOWN' | 'OUTCOME_UNKNOWN';
  } = {},
) {
  store.record({
    clientOrderId: over.clientOrderId ?? 'child-1',
    parentClientOrderId: 'parent-1',
    executionGroupId: over.session ?? 'sess-1',
    childOrderId: over.clientOrderId ?? 'child-1',
    legIndex: 0,
    venueId: over.venueId ?? 'street',
    symbol: 'BTC/USDT',
    side: 'buy',
    execution: null,
    state: over.state ?? 'ACKNOWLEDGED',
    reconciliationKey: null,
    account: over.account ?? 'acct-1',
    session: over.session ?? 'sess-1',
  });
}

describe('killInFlightExecution', () => {
  it('kills by session — child stops when venue confirms canceled', async () => {
    const store = new InMemoryEmsOrderStore();
    seedAck(store);
    const street = new FakeCancel(venueOrder());
    const result = await killInFlightExecution({
      session: 'sess-1',
      cancelByVenue: { street: street.fn },
      emsStore: store,
    });
    expect(result).toMatchObject({ ok: true, scope: { session: 'sess-1' } });
    if (!result.ok) return;
    expect(result.children).toEqual([{ clientOrderId: 'child-1', venueId: 'street', outcome: 'stopped', status: 'canceled' }]);
    expect(street.calls).toEqual([{ symbol: 'BTC/USDT', clientOrderId: 'child-1' }]);
  });

  it('kills by account — same stop, does not cancel another account', async () => {
    const store = new InMemoryEmsOrderStore();
    seedAck(store, { account: 'acct-1' });
    seedAck(store, { clientOrderId: 'child-other', account: 'acct-2', session: 'sess-2' });
    const street = new FakeCancel(venueOrder());
    const result = await killInFlightExecution({
      account: 'acct-1',
      cancelByVenue: { street: street.fn },
      emsStore: store,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.children.map((c) => c.clientOrderId)).toEqual(['child-1']);
    expect(street.calls).toHaveLength(1);
  });

  it('does not cancel a child on a different session', async () => {
    const store = new InMemoryEmsOrderStore();
    seedAck(store, { session: 'sess-1' });
    seedAck(store, { clientOrderId: 'child-other', account: 'acct-2', session: 'sess-2' });
    const street = new FakeCancel(venueOrder());
    const result = await killInFlightExecution({
      session: 'sess-1',
      cancelByVenue: { street: street.fn },
      emsStore: store,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.children.map((c) => c.clientOrderId)).toEqual(['child-1']);
    expect(street.calls).toEqual([{ symbol: 'BTC/USDT', clientOrderId: 'child-1' }]);
  });

  it('refuses both or neither scope', async () => {
    const store = new InMemoryEmsOrderStore();
    expect(await killInFlightExecution({ emsStore: store })).toMatchObject({ ok: false, reason: 'missing_scope' });
    expect(await killInFlightExecution({ account: 'a', session: 's', emsStore: store })).toMatchObject({
      ok: false,
      reason: 'ambiguous_scope',
    });
  });

  it('venue throw is unknown — never invents canceled', async () => {
    const store = new InMemoryEmsOrderStore();
    seedAck(store);
    const street = new FakeCancel(new Error('venue 503'));
    const result = await killInFlightExecution({
      session: 'sess-1',
      cancelByVenue: { street: street.fn },
      emsStore: store,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.children[0]).toMatchObject({ outcome: 'unknown', reason: 'cancel_failed' });
    expect(result.children[0] && 'status' in result.children[0] && result.children[0].status === 'canceled').toBe(false);
  });

  it('pending cancel is unknown', async () => {
    const store = new InMemoryEmsOrderStore();
    seedAck(store);
    const street = new FakeCancel(venueOrder({ status: 'pending', venueOrderId: null }));
    const result = await killInFlightExecution({
      session: 'sess-1',
      cancelByVenue: { street: street.fn },
      emsStore: store,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.children[0]).toMatchObject({ outcome: 'unknown', reason: 'cancel_failed' });
  });

  it('filled race is stopped with filled — not rewritten to canceled', async () => {
    const store = new InMemoryEmsOrderStore();
    seedAck(store);
    const street = new FakeCancel(
      venueOrder({ status: 'filled', filled: parseAmount('1'), remaining: ZERO, averagePrice: parseAmount('100') }),
    );
    const result = await killInFlightExecution({
      session: 'sess-1',
      cancelByVenue: { street: street.fn },
      emsStore: store,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.children[0]).toEqual({
      clientOrderId: 'child-1',
      venueId: 'street',
      outcome: 'stopped',
      status: 'filled',
    });
  });

  it('SUBMIT_UNKNOWN with no cancel injection is unknown', async () => {
    const store = new InMemoryEmsOrderStore();
    seedAck(store, { state: 'SUBMIT_UNKNOWN' });
    const result = await killInFlightExecution({ session: 'sess-1', emsStore: store });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.children[0]).toMatchObject({ outcome: 'unknown', reason: 'cancel_failed' });
  });

  it('REJECTED child is already_stopped and is not canceled again', async () => {
    const store = new InMemoryEmsOrderStore();
    seedAck(store, { state: 'REJECTED' });
    const street = new FakeCancel(venueOrder());
    const result = await killInFlightExecution({
      session: 'sess-1',
      cancelByVenue: { street: street.fn },
      emsStore: store,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.children[0]).toMatchObject({ outcome: 'already_stopped', reason: 'REJECTED' });
    expect(street.calls).toHaveLength(0);
  });

  it('internal venue is unknown — does not invent a matching cancel', async () => {
    const store = new InMemoryEmsOrderStore();
    seedAck(store, { venueId: 'book', clientOrderId: 'child-book' });
    const book = new FakeCancel(venueOrder({ venueId: 'book', clientOrderId: 'child-book' }), 'book');
    const result = await killInFlightExecution({
      session: 'sess-1',
      cancelByVenue: { book: book.fn },
      kindsByVenue: { book: 'internal' },
      emsStore: store,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.children[0]).toMatchObject({
      clientOrderId: 'child-book',
      venueId: 'book',
      outcome: 'unknown',
      reason: 'internal_venue',
    });
    expect(book.calls).toHaveLength(0);
  });

  it('empty scope is an honest empty kill, not a fake cancel', async () => {
    const store = new InMemoryEmsOrderStore();
    const street = new FakeCancel(venueOrder());
    const result = await killInFlightExecution({
      session: 'sess-none',
      cancelByVenue: { street: street.fn },
      emsStore: store,
    });
    expect(result).toEqual({ ok: true, scope: { session: 'sess-none' }, children: [] });
    expect(street.calls).toHaveLength(0);
  });

  it('missing EMS store is refused', async () => {
    expect(await killInFlightExecution({ session: 'sess-1' })).toMatchObject({ ok: false, reason: 'ems_store_unwired' });
  });
});

describe('execution.oms.kill tRPC', () => {
  it('refuses anonymous kill', async () => {
    const router = createExecutionRouter(new SealedHouseTenantRegistry());
    const anon = edgeContext({ headers: { 'x-intafaced-region': 'DE' }, id: 'req-anon' });
    await expect(router.createCaller(anon).execution.oms.kill({ session: 'sess-1' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('session-only admin:write cannot kill', async () => {
    const router = createExecutionRouter(new SealedHouseTenantRegistry());
    await expect(router.createCaller(signed()).execution.oms.kill({ session: 'sess-1' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('kills through the injected map', async () => {
    const store = new InMemoryEmsOrderStore();
    seedAck(store);
    const street = new FakeCancel(venueOrder());
    const caller = createExecutionRouter(
      new SealedHouseTenantRegistry(),
      {},
      { street: street.fn },
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      store,
    ).createCaller(hmacSigned());
    const out = await caller.execution.oms.kill({ session: 'sess-1' });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.children[0]?.outcome).toBe('stopped');
  });
});
