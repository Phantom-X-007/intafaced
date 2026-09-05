import { describe, expect, it } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { SealedHouseTenantRegistry } from '@intafaced/execution-house-tenant';
import type { SorCostTerms } from '@intafaced/venue-adapter';
import type { RestLatencyGrade } from '@intafaced/venue-contracts';
import { planOmsExternalMmHedge, quoteOmsExternalMm } from './oms-market-making.js';
import { createExecutionRouter } from './router.js';

const SECRET = 'a-execution-mm-test-edge-secret-long';
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

function graded(): RestLatencyGrade {
  return {
    venueId: 'v',
    measurement: 'rest-round-trip',
    grade: 'A',
    provisional: false,
    samples: 20,
    p50Ms: 30,
    p95Ms: 40,
    rejectRateBps: 0,
    errorRateBps: 0,
    staleMs: 0,
    reasons: [],
  };
}

function terms(): SorCostTerms {
  return { feeBps: 5, expectedImpactBps: 2, transferCostBps: 1, latencyGrade: graded() };
}

function clearKill() {
  return {
    adminKill: false,
    inventory: { position: '0', minPosition: '-10', maxPosition: '10' },
    volatility: { realizedVolBps: 50, maxVolBps: 200 },
  };
}

const quoteBody = {
  symbol: 'BTC/USDT',
  venueId: 'binance',
  kind: 'external-cex' as const,
  mid: '100',
  book: { bidSize: '5', askSize: '5' },
  quoteSize: '1',
  halfSpreadBps: 10,
  inventorySkewBps: 0,
  costTerms: terms(),
  kill: clearKill(),
};

const hedgeBody = {
  symbol: 'BTC/USDT',
  quoteVenueId: 'binance',
  inventory: { position: '15', minPosition: '-10', maxPosition: '10' },
  kill: clearKill(),
  hedge: {
    venueId: 'bybit',
    kind: 'external-cex' as const,
    mid: '100',
    costTerms: { feeBps: 0, expectedImpactBps: 0, transferCostBps: 0, latencyGrade: graded() },
    availableSize: '10',
  },
};

describe('quoteOmsExternalMm — D26-P1-X5 OMS door', () => {
  it('accepts external quote with caller mid and owner spread params', () => {
    const result = quoteOmsExternalMm({
      symbol: 'BTC/USDT',
      venueId: 'binance',
      kind: 'external-cex',
      mid: '100',
      book: { bidSize: '5', askSize: '5' },
      quoteSize: '1',
      halfSpreadBps: 10,
      inventorySkewBps: 0,
      costTerms: terms(),
      kill: clearKill(),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mid).toBe('100');
      expect(result.bid.price).toBeTruthy();
      expect(result.ask.price).toBeTruthy();
    }
  });

  it('null mid refuses missing_mid — never invents a quote', () => {
    const result = quoteOmsExternalMm({
      symbol: 'BTC/USDT',
      venueId: 'binance',
      kind: 'external-cex',
      mid: null,
      book: { bidSize: '5', askSize: '5' },
      quoteSize: '1',
      halfSpreadBps: 10,
      inventorySkewBps: 0,
      costTerms: terms(),
      kill: clearKill(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('missing_mid');
  });
});

describe('planOmsExternalMmHedge — cross-venue inventory hedge', () => {
  it('sizes hedge when position exceeds max band', () => {
    const result = planOmsExternalMmHedge({
      symbol: 'BTC/USDT',
      quoteVenueId: 'binance',
      inventory: { position: '15', minPosition: '-10', maxPosition: '10' },
      kill: clearKill(),
      hedge: {
        venueId: 'bybit',
        kind: 'external-cex',
        mid: '100',
        costTerms: { feeBps: 0, expectedImpactBps: 0, transferCostBps: 0, latencyGrade: graded() },
        availableSize: '10',
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.side).toBe('sell');
      expect(result.amount).toBe('5');
    }
  });

  it('internal hedge venue refuses honestly', () => {
    const result = planOmsExternalMmHedge({
      symbol: 'BTC/USDT',
      quoteVenueId: 'binance',
      inventory: { position: '15', minPosition: '-10', maxPosition: '10' },
      kill: clearKill(),
      hedge: {
        venueId: 'house',
        kind: 'internal',
        mid: '100',
        costTerms: terms(),
        availableSize: '10',
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('internal_venue');
  });
});

describe('execution.mm.quote tRPC', () => {
  it('refuses anonymous quote', async () => {
    const router = createExecutionRouter(new SealedHouseTenantRegistry());
    const anon = edgeContext({ headers: { 'x-intafaced-region': 'DE' }, id: 'req-anon' });
    await expect(router.createCaller(anon).execution.mm.quote(quoteBody)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('returns wired quote for a signed operator', async () => {
    const caller = createExecutionRouter(new SealedHouseTenantRegistry()).createCaller(hmacSigned());
    const out = await caller.execution.mm.quote(quoteBody);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.mid).toBe('100');
      expect(out.venueId).toBe('binance');
    }
  });

  it('session-only admin:write cannot quote', async () => {
    const caller = createExecutionRouter(new SealedHouseTenantRegistry()).createCaller(signed());
    await expect(caller.execution.mm.quote(quoteBody)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('svc-trade HMAC is FORBIDDEN on quote', async () => {
    const caller = createExecutionRouter(new SealedHouseTenantRegistry()).createCaller({
      ...signed(),
      service: 'svc-trade',
    });
    await expect(caller.execution.mm.quote(quoteBody)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('execution.mm.hedge tRPC', () => {
  it('refuses anonymous hedge', async () => {
    const router = createExecutionRouter(new SealedHouseTenantRegistry());
    const anon = edgeContext({ headers: { 'x-intafaced-region': 'DE' }, id: 'req-anon' });
    await expect(router.createCaller(anon).execution.mm.hedge(hedgeBody)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('returns wired hedge plan for a signed operator', async () => {
    const caller = createExecutionRouter(new SealedHouseTenantRegistry()).createCaller(hmacSigned());
    const out = await caller.execution.mm.hedge(hedgeBody);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.side).toBe('sell');
      expect(out.amount).toBe('5');
      expect(out.hedgeVenueId).toBe('bybit');
    }
  });

  it('session-only admin:write cannot hedge', async () => {
    const caller = createExecutionRouter(new SealedHouseTenantRegistry()).createCaller(signed());
    await expect(caller.execution.mm.hedge(hedgeBody)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
