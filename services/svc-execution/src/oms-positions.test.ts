import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { SealedHouseTenantRegistry } from '@intafaced/execution-house-tenant';
import type { VenuePosition } from '@intafaced/venue-contracts';
import { observeOmsPositions, type OmsPositionsFn } from './oms-positions.js';
import { createExecutionRouter } from './router.js';

const SECRET = 'a-execution-oms-positions-test-edge-secret';
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

function perp(over: Partial<VenuePosition> = {}): VenuePosition {
  return {
    venueId: 'street',
    symbol: 'BTC/USDT',
    side: 'long',
    size: parseAmount('1'),
    entryPrice: parseAmount('50000'),
    markPrice: null,
    unrealisedPnl: null,
    leverageBps: 100_000,
    liquidationPrice: null,
    observedAt: now,
    ...over,
  };
}

class FakePositions {
  readonly symbols: Array<string | undefined> = [];
  readonly sides: Array<'long' | 'short' | undefined> = [];
  constructor(private readonly next: VenuePosition[] | Error) {}
  fn: OmsPositionsFn = async (symbol, side) => {
    this.symbols.push(symbol);
    this.sides.push(side);
    if (this.next instanceof Error) throw this.next;
    return this.next;
  };
}

describe('observeOmsPositions', () => {
  it('returns the venue observation without inventing a mark or PnL', async () => {
    const street = new FakePositions([perp()]);
    const result = await observeOmsPositions({
      venueId: 'street',
      positionsByVenue: { street: street.fn },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.positions).toHaveLength(1);
    expect(result.positions[0]!.markPrice).toBeNull();
    expect(result.positions[0]!.unrealisedPnl).toBeNull();
    expect(street.symbols).toEqual([undefined]);
  });

  it('passes an optional symbol through to the injection', async () => {
    const street = new FakePositions([perp()]);
    await observeOmsPositions({
      venueId: 'street',
      symbol: 'BTC/USDT',
      positionsByVenue: { street: street.fn },
    });
    expect(street.symbols).toEqual(['BTC/USDT']);
  });

  it('passes an optional side through and does not invent the other side', async () => {
    const street = new FakePositions([perp({ side: 'short' })]);
    const result = await observeOmsPositions({
      venueId: 'street',
      side: 'short',
      positionsByVenue: { street: street.fn },
    });
    expect(result.ok).toBe(true);
    expect(street.sides).toEqual(['short']);
    if (!result.ok) return;
    expect(result.positions[0]?.side).toBe('short');
  });

  it('refuses internal venues and does not observe', async () => {
    const book = new FakePositions([perp()]);
    const result = await observeOmsPositions({
      venueId: 'book',
      kind: 'internal',
      positionsByVenue: { book: book.fn },
    });
    expect(result).toMatchObject({ ok: false, reason: 'internal_venue' });
    expect(book.symbols).toHaveLength(0);
  });

  it('surfaces a missing key as observe_failed, never an invented empty book', async () => {
    const street = new FakePositions(new Error('venue credentials missing for street'));
    const result = await observeOmsPositions({
      venueId: 'street',
      positionsByVenue: { street: street.fn },
    });
    expect(result).toMatchObject({ ok: false, reason: 'observe_failed' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect('positions' in result).toBe(false);
  });

  it('empty [] from the venue is honest — the venue reported no positions', async () => {
    const street = new FakePositions([]);
    const result = await observeOmsPositions({
      venueId: 'street',
      positionsByVenue: { street: street.fn },
    });
    expect(result).toEqual({ ok: true, positions: [] });
  });

  it('missing injection is observe_failed', async () => {
    const result = await observeOmsPositions({ venueId: 'street' });
    expect(result).toMatchObject({
      ok: false,
      reason: 'observe_failed',
      detail: 'no position observation injected for venue street',
    });
  });
});

describe('execution.oms.positions tRPC', () => {
  it('refuses anonymous observe', async () => {
    const router = createExecutionRouter(new SealedHouseTenantRegistry());
    const anon = edgeContext({ headers: { 'x-intafaced-region': 'DE' }, id: 'req-anon' });
    await expect(router.createCaller(anon).execution.oms.positions({ venueId: 'street' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('observes through the injected map', async () => {
    const street = new FakePositions([perp()]);
    const caller = createExecutionRouter(new SealedHouseTenantRegistry(), {}, {}, {}, {}, {}, { street: street.fn }).createCaller(
      hmacSigned(),
    );
    const out = await caller.execution.oms.positions({ venueId: 'street', side: 'long' });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.positions).toHaveLength(1);
    expect(street.symbols).toHaveLength(1);
    expect(street.sides).toEqual(['long']);
  });
});
