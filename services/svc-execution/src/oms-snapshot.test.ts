import { describe, expect, it } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { SealedHouseTenantRegistry } from '@intafaced/execution-house-tenant';
import type { VenueBookSnapshot } from '@intafaced/venue-contracts';
import { observeOmsSnapshot, type OmsSnapshotFn } from './oms-snapshot.js';
import { createExecutionRouter } from './router.js';

const SECRET = 'a-execution-oms-snapshot-test-edge-secret';
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

function emptyBook(over: Partial<VenueBookSnapshot> = {}): VenueBookSnapshot {
  return {
    venueId: 'street',
    symbol: 'BTC/USDT',
    bids: [],
    asks: [],
    sequence: -1,
    sequenced: false,
    observedAt: now,
    ...over,
  };
}

class FakeSnapshot {
  readonly symbols: string[] = [];
  readonly limits: Array<number | undefined> = [];
  constructor(private readonly next: VenueBookSnapshot | Error) {}
  fn: OmsSnapshotFn = async (symbol, limit) => {
    this.symbols.push(symbol);
    this.limits.push(limit);
    if (this.next instanceof Error) throw this.next;
    return this.next;
  };
}

describe('observeOmsSnapshot', () => {
  it('returns an empty unsequenced book without inventing a mid or sequence 0', async () => {
    const street = new FakeSnapshot(emptyBook());
    const result = await observeOmsSnapshot({
      venueId: 'street',
      symbol: 'BTC/USDT',
      snapshotByVenue: { street: street.fn },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.bids).toEqual([]);
    expect(result.snapshot.asks).toEqual([]);
    expect(result.snapshot.sequenced).toBe(false);
    expect(result.snapshot.sequence).toBe(-1);
    expect(street.symbols).toEqual(['BTC/USDT']);
  });

  it('forwards an optional depth limit and does not invent one when absent', async () => {
    const street = new FakeSnapshot(emptyBook());
    await observeOmsSnapshot({
      venueId: 'street',
      symbol: 'BTC/USDT',
      limit: 5,
      snapshotByVenue: { street: street.fn },
    });
    expect(street.limits).toEqual([5]);
    street.limits.length = 0;
    await observeOmsSnapshot({
      venueId: 'street',
      symbol: 'BTC/USDT',
      snapshotByVenue: { street: street.fn },
    });
    expect(street.limits).toEqual([undefined]);
  });

  it('refuses internal venues and does not observe', async () => {
    const book = new FakeSnapshot(emptyBook());
    const result = await observeOmsSnapshot({
      venueId: 'book',
      symbol: 'BTC/USDT',
      kind: 'internal',
      snapshotByVenue: { book: book.fn },
    });
    expect(result).toMatchObject({ ok: false, reason: 'internal_venue' });
    expect(book.symbols).toHaveLength(0);
  });

  it('surfaces a thrown street as observe_failed, never an invented book', async () => {
    const street = new FakeSnapshot(new Error('snapshotBook is not wired on this market-data adapter'));
    const result = await observeOmsSnapshot({
      venueId: 'street',
      symbol: 'BTC/USDT',
      snapshotByVenue: { street: street.fn },
    });
    expect(result).toMatchObject({ ok: false, reason: 'observe_failed' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect('snapshot' in result).toBe(false);
  });

  it('missing symbol is observe_failed, not an all-market invent', async () => {
    const street = new FakeSnapshot(emptyBook());
    const result = await observeOmsSnapshot({
      venueId: 'street',
      symbol: '  ',
      snapshotByVenue: { street: street.fn },
    });
    expect(result).toMatchObject({ ok: false, reason: 'observe_failed', detail: 'symbol is required' });
    expect(street.symbols).toHaveLength(0);
  });

  it('missing injection is observe_failed', async () => {
    const result = await observeOmsSnapshot({ venueId: 'street', symbol: 'BTC/USDT' });
    expect(result).toMatchObject({
      ok: false,
      reason: 'observe_failed',
      detail: 'no book-snapshot observation injected for venue street',
    });
  });
});

describe('execution.oms.snapshot tRPC', () => {
  it('refuses anonymous observe', async () => {
    const router = createExecutionRouter(new SealedHouseTenantRegistry());
    const anon = edgeContext({ headers: { 'x-intafaced-region': 'DE' }, id: 'req-anon' });
    await expect(router.createCaller(anon).execution.oms.snapshot({ venueId: 'street', symbol: 'BTC/USDT' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('observes through the injected map', async () => {
    const street = new FakeSnapshot(emptyBook({ symbol: 'ETH/USDT' }));
    const caller = createExecutionRouter(
      new SealedHouseTenantRegistry(),
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
      {},
      { street: street.fn },
    ).createCaller(hmacSigned());
    const out = await caller.execution.oms.snapshot({ venueId: 'street', symbol: 'ETH/USDT', limit: 20 });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.snapshot.symbol).toBe('ETH/USDT');
    expect(out.snapshot.bids).toEqual([]);
    expect(street.symbols).toEqual(['ETH/USDT']);
    expect(street.limits).toEqual([20]);
  });
});
