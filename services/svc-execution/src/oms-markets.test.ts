import { describe, expect, it } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { SealedHouseTenantRegistry } from '@intafaced/execution-house-tenant';
import type { VenueInstrumentType, VenueMarket } from '@intafaced/venue-contracts';
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

function hmacSigned(p: Principal = principal()) {
  return { ...signed(p), service: 'svc-execution' as const };
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
  readonly types: (VenueInstrumentType | undefined)[] = [];
  readonly quotes: (string | undefined)[] = [];
  readonly bases: (string | undefined)[] = [];
  readonly actives: (boolean | undefined)[] = [];
  readonly settles: (string | undefined)[] = [];
  readonly symbols: (string | undefined)[] = [];
  readonly venueSymbols: (string | undefined)[] = [];
  readonly expiries: (Date | undefined)[] = [];
  constructor(private readonly next: readonly VenueMarket[] | Error) {}
  fn: OmsMarketsFn = async (type, quote, base, active, settle, symbol, venueSymbol, expiry) => {
    this.calls += 1;
    this.types.push(type);
    this.quotes.push(quote);
    this.bases.push(base);
    this.actives.push(active);
    this.settles.push(settle);
    this.symbols.push(symbol);
    this.venueSymbols.push(venueSymbol);
    this.expiries.push(expiry);
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
    expect(street.types).toEqual([undefined]);
    expect(street.expiries).toEqual([undefined]);
  });

  it('passes an optional type through and does not invent a missing listing', async () => {
    const street = new FakeMarkets([listed({ type: 'perpetual', symbol: 'BTC/USDT:USDT', venueSymbol: 'BTCUSDT' })]);
    const result = await observeOmsMarkets({
      venueId: 'street',
      type: 'perpetual',
      marketsByVenue: { street: street.fn },
    });
    expect(result.ok).toBe(true);
    expect(street.types).toEqual(['perpetual']);
    if (!result.ok) return;
    expect(result.markets[0]?.type).toBe('perpetual');
  });

  it('passes an optional quote through and does not invent a missing listing', async () => {
    const street = new FakeMarkets([listed({ quote: 'BTC', symbol: 'ETH/BTC', venueSymbol: 'ETHBTC', base: 'ETH' })]);
    const result = await observeOmsMarkets({
      venueId: 'street',
      quote: 'BTC',
      marketsByVenue: { street: street.fn },
    });
    expect(result.ok).toBe(true);
    expect(street.quotes).toEqual(['BTC']);
    if (!result.ok) return;
    expect(result.markets[0]?.quote).toBe('BTC');
  });

  it('passes an optional base through and does not invent a missing listing', async () => {
    const street = new FakeMarkets([listed({ base: 'ETH', symbol: 'ETH/USDT', venueSymbol: 'ETHUSDT' })]);
    const result = await observeOmsMarkets({
      venueId: 'street',
      base: 'ETH',
      marketsByVenue: { street: street.fn },
    });
    expect(result.ok).toBe(true);
    expect(street.bases).toEqual(['ETH']);
    if (!result.ok) return;
    expect(result.markets[0]?.base).toBe('ETH');
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
    expect(result.markets[0]?.settle).toBeNull();
    expect(result.markets[0]?.expiry).toBeNull();
    expect(street.actives).toEqual([undefined]);
    expect(street.expiries).toEqual([undefined]);
  });

  it('passes an optional active through and does not invent a missing listing', async () => {
    const street = new FakeMarkets([listed({ active: false })]);
    const result = await observeOmsMarkets({
      venueId: 'street',
      active: false,
      marketsByVenue: { street: street.fn },
    });
    expect(result.ok).toBe(true);
    expect(street.actives).toEqual([false]);
    if (!result.ok) return;
    expect(result.markets[0]?.active).toBe(false);
  });

  it('passes an optional settle through and does not invent a missing listing', async () => {
    const street = new FakeMarkets([listed({ type: 'perpetual', symbol: 'BTC/USDT:USDT', venueSymbol: 'BTCUSDT', settle: 'USDT' })]);
    const result = await observeOmsMarkets({
      venueId: 'street',
      settle: 'USDT',
      marketsByVenue: { street: street.fn },
    });
    expect(result.ok).toBe(true);
    expect(street.settles).toEqual(['USDT']);
    if (!result.ok) return;
    expect(result.markets[0]?.settle).toBe('USDT');
  });

  it('passes an optional symbol through and does not invent a missing listing', async () => {
    const street = new FakeMarkets([listed({ symbol: 'ETH/USDT', venueSymbol: 'ETHUSDT', base: 'ETH' })]);
    const result = await observeOmsMarkets({
      venueId: 'street',
      symbol: 'ETH/USDT',
      marketsByVenue: { street: street.fn },
    });
    expect(result.ok).toBe(true);
    expect(street.symbols).toEqual(['ETH/USDT']);
    if (!result.ok) return;
    expect(result.markets[0]?.symbol).toBe('ETH/USDT');
  });

  it('passes an optional venueSymbol through and does not invent a missing listing', async () => {
    const street = new FakeMarkets([listed({ symbol: 'ETH/USDT', venueSymbol: 'ETHUSDT', base: 'ETH' })]);
    const result = await observeOmsMarkets({
      venueId: 'street',
      venueSymbol: 'ETHUSDT',
      marketsByVenue: { street: street.fn },
    });
    expect(result.ok).toBe(true);
    expect(street.venueSymbols).toEqual(['ETHUSDT']);
    if (!result.ok) return;
    expect(result.markets[0]?.venueSymbol).toBe('ETHUSDT');
  });

  it('passes an optional expiry through by Date.getTime and does not invent a missing listing', async () => {
    const expiry = new Date('2026-12-26T08:00:00.000Z');
    const street = new FakeMarkets([listed({ type: 'future', symbol: 'BTC/USDT:USDT', venueSymbol: 'BTCUSDT', settle: 'USDT', expiry })]);
    const result = await observeOmsMarkets({
      venueId: 'street',
      expiry,
      marketsByVenue: { street: street.fn },
    });
    expect(result.ok).toBe(true);
    expect(street.expiries).toHaveLength(1);
    expect(street.expiries[0]?.getTime()).toBe(expiry.getTime());
    if (!result.ok) return;
    expect(result.markets[0]?.expiry?.getTime()).toBe(expiry.getTime());
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
    ).createCaller(hmacSigned());
    const out = await caller.execution.oms.markets({
      venueId: 'street',
      type: 'spot',
      quote: 'USDT',
      base: 'ETH',
      active: false,
      settle: 'USDT',
      symbol: 'ETH/USDT',
      venueSymbol: 'ETHUSDT',
      expiry: new Date('2026-12-26T08:00:00.000Z'),
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.markets[0]?.symbol).toBe('ETH/USDT');
    expect(street.types).toEqual(['spot']);
    expect(street.quotes).toEqual(['USDT']);
    expect(street.bases).toEqual(['ETH']);
    expect(street.actives).toEqual([false]);
    expect(street.settles).toEqual(['USDT']);
    expect(street.symbols).toEqual(['ETH/USDT']);
    expect(street.venueSymbols).toEqual(['ETHUSDT']);
    expect(street.expiries[0]?.getTime()).toBe(new Date('2026-12-26T08:00:00.000Z').getTime());
  });
});
