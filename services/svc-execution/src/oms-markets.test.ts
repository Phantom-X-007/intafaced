import { describe, expect, it } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { SealedHouseTenantRegistry } from '@intafaced/execution-house-tenant';
import type { VenueMarket } from '@intafaced/venue-contracts';
import { observeOmsMarkets, type OmsMarketsFn } from './oms-markets.js';
import { createExecutionRouter } from './router.js';

const SECRET = 'a-execution-oms-markets-test-edge-secret';
const OP = '33333333-3333-4333-8333-333333333333';
const edgeContext = createEdgeContext({ secret: SECRET, serviceName: 'svc-execution' });

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

function listed(over: Partial<VenueMarket> = {}): VenueMarket {
  return {
    venueId: 'street',
    symbol: 'BTC/USDT',
    venueSymbol: 'BTCUSDT',
    type: 'spot',
    base: 'BTC',
    quote: 'USDT',
    settle: null,
    active: false,
    contractSize: null,
    expiry: null,
    observedAt: new Date('2026-08-17T00:00:00.000Z'),
    ...over,
  } as VenueMarket;
}

class FakeMarkets {
  calls = 0;
  constructor(private readonly next: readonly VenueMarket[] | Error) {}
  fn: OmsMarketsFn = async () => {
    this.calls += 1;
    if (this.next instanceof Error) throw this.next;
    return this.next;
  };
}

describe('observeOmsMarkets', () => {
  it('returns the venue listing without inventing a market when the street is empty', async () => {
    const street = new FakeMarkets([]);
    const result = await observeOmsMarkets({
      venueId: 'street',
      marketsByVenue: { street: street.fn },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.markets).toEqual([]);
    expect(street.calls).toBe(1);
  });

  it('passes through inactive listings — halted is not rewritten to active', async () => {
    const street = new FakeMarkets([listed({ active: false })]);
    const result = await observeOmsMarkets({
      venueId: 'street',
      marketsByVenue: { street: street.fn },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.markets[0]?.active).toBe(false);
    expect(result.markets[0]?.symbol).toBe('BTC/USDT');
  });

  it('refuses internal venues and does not observe', async () => {
    const book = new FakeMarkets([listed()]);
    const result = await observeOmsMarkets({
      venueId: 'book',
      kind: 'internal',
      marketsByVenue: { book: book.fn },
    });
    expect(result).toMatchObject({ ok: false, reason: 'internal_venue' });
    expect(book.calls).toBe(0);
  });

  it('surfaces a thrown street as observe_failed, never an invented listing', async () => {
    const street = new FakeMarkets(new Error('markets is not wired on this market-data adapter'));
    const result = await observeOmsMarkets({
      venueId: 'street',
      marketsByVenue: { street: street.fn },
    });
    expect(result).toMatchObject({ ok: false, reason: 'observe_failed' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect('markets' in result).toBe(false);
  });

  it('missing injection is observe_failed', async () => {
    const result = await observeOmsMarkets({ venueId: 'street' });
    expect(result).toMatchObject({
      ok: false,
      reason: 'observe_failed',
      detail: 'no markets observation injected for venue street',
    });
  });
});

describe('execution.oms.markets tRPC', () => {
  it('refuses anonymous observe', async () => {
    const router = createExecutionRouter(new SealedHouseTenantRegistry());
    const anon = edgeContext({ headers: { 'x-intafaced-region': 'DE' }, id: 'req-anon' });
    await expect(router.createCaller(anon).execution.oms.markets({ venueId: 'street' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('observes through the injected map', async () => {
    const street = new FakeMarkets([listed({ symbol: 'ETH/USDT', venueSymbol: 'ETHUSDT', base: 'ETH' })]);
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
      { street: street.fn },
    ).createCaller(signed());
    const out = await caller.execution.oms.markets({ venueId: 'street' });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.markets[0]?.symbol).toBe('ETH/USDT');
    expect(street.calls).toBe(1);
  });
});
