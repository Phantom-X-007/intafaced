import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { SealedHouseTenantRegistry } from '@intafaced/execution-house-tenant';
import type { FundingRate } from '@intafaced/venue-contracts';
import { observeOmsFunding, type OmsFundingFn } from './oms-funding.js';
import { createExecutionRouter } from './router.js';

const SECRET = 'a-execution-oms-funding-test-edge-secret';
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

function btcFunding(over: Partial<FundingRate> = {}): FundingRate {
  return {
    venueId: 'street',
    symbol: 'BTC/USDT',
    rate: parseAmount('0.0001'),
    intervalSeconds: 28_800,
    nextFundingAt: now,
    markPrice: null,
    indexPrice: null,
    observedAt: now,
    ...over,
  };
}

class FakeFunding {
  readonly symbols: string[] = [];
  constructor(private readonly next: FundingRate | Error) {}
  fn: OmsFundingFn = async (symbol) => {
    this.symbols.push(symbol);
    if (this.next instanceof Error) throw this.next;
    return this.next;
  };
}

describe('observeOmsFunding', () => {
  it('returns the venue observation without rewriting a null mark as 0', async () => {
    const street = new FakeFunding(btcFunding());
    const result = await observeOmsFunding({
      venueId: 'street',
      symbol: 'BTC/USDT',
      fundingByVenue: { street: street.fn },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.funding.rate).toBe(parseAmount('0.0001'));
    expect(result.funding.markPrice).toBeNull();
    expect(result.funding.indexPrice).toBeNull();
    expect(street.symbols).toEqual(['BTC/USDT']);
  });

  it('refuses internal venues and does not observe', async () => {
    const book = new FakeFunding(btcFunding());
    const result = await observeOmsFunding({
      venueId: 'book',
      symbol: 'BTC/USDT',
      kind: 'internal',
      fundingByVenue: { book: book.fn },
    });
    expect(result).toMatchObject({ ok: false, reason: 'internal_venue' });
    expect(book.symbols).toHaveLength(0);
  });

  it('surfaces a thrown street as observe_failed, never an invented 0 rate', async () => {
    const street = new FakeFunding(new Error('fundingRate is not wired on this market-data adapter'));
    const result = await observeOmsFunding({
      venueId: 'street',
      symbol: 'BTC/USDT',
      fundingByVenue: { street: street.fn },
    });
    expect(result).toMatchObject({ ok: false, reason: 'observe_failed' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect('funding' in result).toBe(false);
  });

  it('missing symbol is observe_failed, not an all-market invent', async () => {
    const street = new FakeFunding(btcFunding());
    const result = await observeOmsFunding({
      venueId: 'street',
      symbol: '  ',
      fundingByVenue: { street: street.fn },
    });
    expect(result).toMatchObject({ ok: false, reason: 'observe_failed', detail: 'symbol is required' });
    expect(street.symbols).toHaveLength(0);
  });

  it('missing injection is observe_failed', async () => {
    const result = await observeOmsFunding({ venueId: 'street', symbol: 'BTC/USDT' });
    expect(result).toMatchObject({
      ok: false,
      reason: 'observe_failed',
      detail: 'no funding-rate observation injected for venue street',
    });
  });
});

describe('execution.oms.funding tRPC', () => {
  it('refuses anonymous observe', async () => {
    const router = createExecutionRouter(new SealedHouseTenantRegistry());
    const anon = edgeContext({ headers: { 'x-intafaced-region': 'DE' }, id: 'req-anon' });
    await expect(router.createCaller(anon).execution.oms.funding({ venueId: 'street', symbol: 'BTC/USDT' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('observes through the injected map', async () => {
    const street = new FakeFunding(btcFunding({ rate: parseAmount('-0.0001') }));
    const caller = createExecutionRouter(new SealedHouseTenantRegistry(), {}, {}, {}, {}, {}, {}, {}, { street: street.fn }).createCaller(
      hmacSigned(),
    );
    const out = await caller.execution.oms.funding({ venueId: 'street', symbol: 'BTC/USDT' });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.funding.rate).toBe(parseAmount('-0.0001'));
    expect(street.symbols).toEqual(['BTC/USDT']);
  });
});
