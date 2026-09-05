import { describe, expect, it } from 'vitest';
import { parseAmount, ZERO } from '@intafaced/ledger-client';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { SealedHouseTenantRegistry } from '@intafaced/execution-house-tenant';
import type { VenueBalance } from '@intafaced/venue-contracts';
import { observeOmsBalances, type OmsBalancesFn } from './oms-balances.js';
import { createExecutionRouter } from './router.js';

const SECRET = 'a-execution-oms-balances-test-edge-secret';
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

function usdt(over: Partial<VenueBalance> = {}): VenueBalance {
  return {
    venueId: 'street',
    asset: 'USDT',
    free: parseAmount('100'),
    used: ZERO,
    total: parseAmount('100'),
    observedAt: now,
    ...over,
  };
}

class FakeBalances {
  readonly assets: Array<string | undefined> = [];
  constructor(private readonly next: VenueBalance[] | Error) {}
  fn: OmsBalancesFn = async (asset) => {
    this.assets.push(asset);
    if (this.next instanceof Error) throw this.next;
    return this.next;
  };
}

describe('observeOmsBalances', () => {
  it('returns the venue observation without treating it as a ledger balance', async () => {
    const street = new FakeBalances([usdt()]);
    const result = await observeOmsBalances({
      venueId: 'street',
      balancesByVenue: { street: street.fn },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.balances).toHaveLength(1);
    expect(result.balances[0]!.asset).toBe('USDT');
    expect(street.assets).toEqual([undefined]);
  });

  it('passes an optional asset through and does not invent a missing row', async () => {
    const street = new FakeBalances([usdt({ asset: 'BTC', free: parseAmount('1'), total: parseAmount('1') })]);
    const result = await observeOmsBalances({
      venueId: 'street',
      asset: 'BTC',
      balancesByVenue: { street: street.fn },
    });
    expect(result.ok).toBe(true);
    expect(street.assets).toEqual(['BTC']);
    if (!result.ok) return;
    expect(result.balances[0]?.asset).toBe('BTC');
  });

  it('refuses internal venues and does not observe', async () => {
    const book = new FakeBalances([usdt()]);
    const result = await observeOmsBalances({
      venueId: 'book',
      kind: 'internal',
      balancesByVenue: { book: book.fn },
    });
    expect(result).toMatchObject({ ok: false, reason: 'internal_venue' });
    expect(book.assets).toHaveLength(0);
  });

  it('surfaces a missing key as observe_failed, never an invented empty wallet', async () => {
    const street = new FakeBalances(new Error('venue credentials missing for street'));
    const result = await observeOmsBalances({
      venueId: 'street',
      balancesByVenue: { street: street.fn },
    });
    expect(result).toMatchObject({ ok: false, reason: 'observe_failed' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect('balances' in result).toBe(false);
  });

  it('empty [] from the venue is honest — the venue reported no assets', async () => {
    const street = new FakeBalances([]);
    const result = await observeOmsBalances({
      venueId: 'street',
      balancesByVenue: { street: street.fn },
    });
    expect(result).toEqual({ ok: true, balances: [] });
  });

  it('missing injection is observe_failed', async () => {
    const result = await observeOmsBalances({ venueId: 'street' });
    expect(result).toMatchObject({
      ok: false,
      reason: 'observe_failed',
      detail: 'no balance observation injected for venue street',
    });
  });
});

describe('execution.oms.balances tRPC', () => {
  it('refuses anonymous observe', async () => {
    const router = createExecutionRouter(new SealedHouseTenantRegistry());
    const anon = edgeContext({ headers: { 'x-intafaced-region': 'DE' }, id: 'req-anon' });
    await expect(router.createCaller(anon).execution.oms.balances({ venueId: 'street' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('observes through the injected map', async () => {
    const street = new FakeBalances([usdt()]);
    const caller = createExecutionRouter(new SealedHouseTenantRegistry(), {}, {}, {}, {}, { street: street.fn }).createCaller(hmacSigned());
    const out = await caller.execution.oms.balances({ venueId: 'street', asset: 'USDT' });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.balances).toHaveLength(1);
    expect(street.assets).toEqual(['USDT']);
  });
});
