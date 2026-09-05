import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { SealedHouseTenantRegistry } from '@intafaced/execution-house-tenant';
import type { TransferRail } from '@intafaced/venue-contracts';
import { observeOmsRails, type OmsRailsFn } from './oms-rails.js';
import { createExecutionRouter } from './router.js';

const SECRET = 'a-execution-oms-rails-test-edge-secret';
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

function usdtRail(over: Partial<TransferRail> = {}): TransferRail {
  return {
    fromVenueId: 'street',
    toVenueId: 'harbour',
    asset: 'USDT',
    network: 'trc20',
    minAmount: parseAmount('10'),
    fee: parseAmount('1'),
    estimatedSeconds: 600,
    enabled: false,
    observedAt: now,
    ...over,
  };
}

class FakeRails {
  readonly assets: string[] = [];
  readonly enableds: (boolean | undefined)[] = [];
  readonly networks: (string | undefined)[] = [];
  readonly toVenueIds: (string | undefined)[] = [];
  readonly fromVenueIds: (string | undefined)[] = [];
  constructor(private readonly next: TransferRail[] | Error) {}
  fn: OmsRailsFn = async (asset, enabled, network, toVenueId, fromVenueId) => {
    this.assets.push(asset);
    this.enableds.push(enabled);
    this.networks.push(network);
    this.toVenueIds.push(toVenueId);
    this.fromVenueIds.push(fromVenueId);
    if (this.next instanceof Error) throw this.next;
    return this.next;
  };
}

describe('observeOmsRails', () => {
  it('returns the venue observation without rewriting a disabled rail as open', async () => {
    const street = new FakeRails([usdtRail()]);
    const result = await observeOmsRails({
      venueId: 'street',
      asset: 'USDT',
      railsByVenue: { street: street.fn },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rails).toHaveLength(1);
    expect(result.rails[0]!.enabled).toBe(false);
    expect(street.assets).toEqual(['USDT']);
    expect(street.enableds).toEqual([undefined]);
  });

  it('passes an optional enabled through and does not invent a missing rail', async () => {
    const street = new FakeRails([usdtRail({ enabled: false })]);
    const result = await observeOmsRails({
      venueId: 'street',
      asset: 'USDT',
      enabled: false,
      railsByVenue: { street: street.fn },
    });
    expect(result.ok).toBe(true);
    expect(street.enableds).toEqual([false]);
    if (!result.ok) return;
    expect(result.rails[0]!.enabled).toBe(false);
  });

  it('passes an optional network through and does not invent a missing rail', async () => {
    const street = new FakeRails([usdtRail({ network: 'erc20' })]);
    const result = await observeOmsRails({
      venueId: 'street',
      asset: 'USDT',
      network: 'erc20',
      railsByVenue: { street: street.fn },
    });
    expect(result.ok).toBe(true);
    expect(street.networks).toEqual(['erc20']);
    if (!result.ok) return;
    expect(result.rails[0]!.network).toBe('erc20');
  });

  it('passes an optional toVenueId through and does not invent a missing rail', async () => {
    const street = new FakeRails([usdtRail({ toVenueId: 'harbour' })]);
    const result = await observeOmsRails({
      venueId: 'street',
      asset: 'USDT',
      toVenueId: 'harbour',
      railsByVenue: { street: street.fn },
    });
    expect(result.ok).toBe(true);
    expect(street.toVenueIds).toEqual(['harbour']);
    if (!result.ok) return;
    expect(result.rails[0]!.toVenueId).toBe('harbour');
  });

  it('passes an optional fromVenueId through and does not invent a missing rail', async () => {
    const street = new FakeRails([usdtRail({ fromVenueId: 'street' })]);
    const result = await observeOmsRails({
      venueId: 'street',
      asset: 'USDT',
      fromVenueId: 'street',
      railsByVenue: { street: street.fn },
    });
    expect(result.ok).toBe(true);
    expect(street.fromVenueIds).toEqual(['street']);
    if (!result.ok) return;
    expect(result.rails[0]!.fromVenueId).toBe('street');
  });

  it('refuses internal venues and does not observe', async () => {
    const book = new FakeRails([usdtRail({ enabled: true })]);
    const result = await observeOmsRails({
      venueId: 'book',
      asset: 'USDT',
      kind: 'internal',
      railsByVenue: { book: book.fn },
    });
    expect(result).toMatchObject({ ok: false, reason: 'internal_venue' });
    expect(book.assets).toHaveLength(0);
  });

  it('surfaces a missing key as observe_failed, never an invented empty rail list', async () => {
    const street = new FakeRails(new Error('venue credentials missing for street'));
    const result = await observeOmsRails({
      venueId: 'street',
      asset: 'USDT',
      railsByVenue: { street: street.fn },
    });
    expect(result).toMatchObject({ ok: false, reason: 'observe_failed' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect('rails' in result).toBe(false);
  });

  it('empty [] from the venue is honest — no rails for that asset', async () => {
    const street = new FakeRails([]);
    const result = await observeOmsRails({
      venueId: 'street',
      asset: 'USDT',
      railsByVenue: { street: street.fn },
    });
    expect(result).toEqual({ ok: true, rails: [] });
  });

  it('missing asset is observe_failed, not an all-asset invent', async () => {
    const street = new FakeRails([usdtRail()]);
    const result = await observeOmsRails({
      venueId: 'street',
      asset: '  ',
      railsByVenue: { street: street.fn },
    });
    expect(result).toMatchObject({ ok: false, reason: 'observe_failed', detail: 'asset is required' });
    expect(street.assets).toHaveLength(0);
  });

  it('missing injection is observe_failed', async () => {
    const result = await observeOmsRails({ venueId: 'street', asset: 'USDT' });
    expect(result).toMatchObject({
      ok: false,
      reason: 'observe_failed',
      detail: 'no transfer-rail observation injected for venue street',
    });
  });
});

describe('execution.oms.rails tRPC', () => {
  it('refuses anonymous observe', async () => {
    const router = createExecutionRouter(new SealedHouseTenantRegistry());
    const anon = edgeContext({ headers: { 'x-intafaced-region': 'DE' }, id: 'req-anon' });
    await expect(router.createCaller(anon).execution.oms.rails({ venueId: 'street', asset: 'USDT' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('observes through the injected map', async () => {
    const street = new FakeRails([usdtRail({ enabled: true })]);
    const caller = createExecutionRouter(new SealedHouseTenantRegistry(), {}, {}, {}, {}, {}, {}, { street: street.fn }).createCaller(
      hmacSigned(),
    );
    const out = await caller.execution.oms.rails({
      venueId: 'street',
      asset: 'USDT',
      enabled: false,
      network: 'trc20',
      toVenueId: 'harbour',
      fromVenueId: 'street',
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.rails).toHaveLength(1);
    expect(street.assets).toEqual(['USDT']);
    expect(street.enableds).toEqual([false]);
    expect(street.networks).toEqual(['trc20']);
    expect(street.toVenueIds).toEqual(['harbour']);
    expect(street.fromVenueIds).toEqual(['street']);
  });
});
