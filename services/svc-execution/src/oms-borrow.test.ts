import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { SealedHouseTenantRegistry } from '@intafaced/execution-house-tenant';
import type { BorrowRate } from '@intafaced/venue-contracts';
import { observeOmsBorrow, type OmsBorrowFn } from './oms-borrow.js';
import { createExecutionRouter } from './router.js';

const SECRET = 'a-execution-oms-borrow-test-edge-secret';
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

function usdtBorrow(over: Partial<BorrowRate> = {}): BorrowRate {
  return {
    venueId: 'street',
    asset: 'USDT',
    hourlyRate: parseAmount('0.0001'),
    available: null,
    observedAt: now,
    ...over,
  };
}

class FakeBorrow {
  readonly assets: string[] = [];
  constructor(private readonly next: BorrowRate | Error) {}
  fn: OmsBorrowFn = async (asset) => {
    this.assets.push(asset);
    if (this.next instanceof Error) throw this.next;
    return this.next;
  };
}

describe('observeOmsBorrow', () => {
  it('returns the venue observation without rewriting null available as 0', async () => {
    const street = new FakeBorrow(usdtBorrow());
    const result = await observeOmsBorrow({
      venueId: 'street',
      asset: 'USDT',
      borrowByVenue: { street: street.fn },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.borrow.hourlyRate).toBe(parseAmount('0.0001'));
    expect(result.borrow.available).toBeNull();
    expect(street.assets).toEqual(['USDT']);
  });

  it('refuses internal venues and does not observe', async () => {
    const book = new FakeBorrow(usdtBorrow());
    const result = await observeOmsBorrow({
      venueId: 'book',
      asset: 'USDT',
      kind: 'internal',
      borrowByVenue: { book: book.fn },
    });
    expect(result).toMatchObject({ ok: false, reason: 'internal_venue' });
    expect(book.assets).toHaveLength(0);
  });

  it('surfaces a thrown street as observe_failed, never an invented 0 rate', async () => {
    const street = new FakeBorrow(new Error('borrowRate is not wired on this market-data adapter'));
    const result = await observeOmsBorrow({
      venueId: 'street',
      asset: 'USDT',
      borrowByVenue: { street: street.fn },
    });
    expect(result).toMatchObject({ ok: false, reason: 'observe_failed' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect('borrow' in result).toBe(false);
  });

  it('missing asset is observe_failed, not an all-asset invent', async () => {
    const street = new FakeBorrow(usdtBorrow());
    const result = await observeOmsBorrow({
      venueId: 'street',
      asset: '  ',
      borrowByVenue: { street: street.fn },
    });
    expect(result).toMatchObject({ ok: false, reason: 'observe_failed', detail: 'asset is required' });
    expect(street.assets).toHaveLength(0);
  });

  it('missing injection is observe_failed', async () => {
    const result = await observeOmsBorrow({ venueId: 'street', asset: 'USDT' });
    expect(result).toMatchObject({
      ok: false,
      reason: 'observe_failed',
      detail: 'no borrow-rate observation injected for venue street',
    });
  });
});

describe('execution.oms.borrow tRPC', () => {
  it('refuses anonymous observe', async () => {
    const router = createExecutionRouter(new SealedHouseTenantRegistry());
    const anon = edgeContext({ headers: { 'x-intafaced-region': 'DE' }, id: 'req-anon' });
    await expect(router.createCaller(anon).execution.oms.borrow({ venueId: 'street', asset: 'USDT' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('observes through the injected map', async () => {
    const street = new FakeBorrow(usdtBorrow({ hourlyRate: parseAmount('-0.0001') }));
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
      { street: street.fn },
    ).createCaller(hmacSigned());
    const out = await caller.execution.oms.borrow({ venueId: 'street', asset: 'USDT' });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.borrow.hourlyRate).toBe(parseAmount('-0.0001'));
    expect(street.assets).toEqual(['USDT']);
  });
});
