import { describe, expect, it } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { SealedHouseTenantRegistry } from '@intafaced/execution-house-tenant';
import { latencyGradeWire } from './oms-plan.js';
import { scanOmsExternalArb } from './oms-arbitrage.js';
import { createExecutionRouter } from './router.js';

const SECRET = 'a-execution-arb-test-edge-secret-long';
const OP = '33333333-3333-4333-8333-333333333333';
const FRESH_NOW_MS = 1_000_000;
const MAX_QUOTE_AGE_MS = 5_000;

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

function completeTerms(venueId: string) {
  return {
    feeBps: 5,
    expectedImpactBps: 0,
    transferCostBps: 0,
    latencyGrade: latencyGradeWire(venueId),
  };
}

const scanBody = {
  symbol: 'BTC/USDT',
  amount: '1',
  quotes: [
    {
      venueId: 'binance',
      kind: 'external-cex' as const,
      price: '100',
      amount: '1',
      asOfMs: FRESH_NOW_MS,
    },
    {
      venueId: 'bybit',
      kind: 'external-cex' as const,
      price: '101',
      amount: '1',
      asOfMs: FRESH_NOW_MS,
    },
  ],
  costTermsByVenue: {
    binance: completeTerms('binance'),
    bybit: completeTerms('bybit'),
  },
  inventory: { prePositionedByVenue: { binance: true, bybit: true } },
  nowMs: FRESH_NOW_MS,
  maxQuoteAgeMs: MAX_QUOTE_AGE_MS,
};

describe('scanOmsExternalArb', () => {
  it('emits a wired external CEX↔CEX opportunity when edge is positive', () => {
    const result = scanOmsExternalArb(scanBody);
    expect(result.opportunities).toHaveLength(1);
    const opp = result.opportunities[0]!;
    expect(opp.buyVenueId).toBe('binance');
    expect(opp.sellVenueId).toBe('bybit');
    expect(opp.buyAllIn).toBe('100.05');
    expect(Number(opp.edgePerUnit)).toBeGreaterThan(0);
  });

  it('refuses internal venues at the OMS door (P0-01)', () => {
    const result = scanOmsExternalArb({
      ...scanBody,
      quotes: [
        {
          venueId: 'house',
          kind: 'internal',
          price: '99',
          amount: '1',
          asOfMs: FRESH_NOW_MS,
        },
        scanBody.quotes[1]!,
      ],
      costTermsByVenue: {
        house: completeTerms('house'),
        bybit: completeTerms('bybit'),
      },
      inventory: { prePositionedByVenue: { house: true, bybit: true } },
    });
    expect(result.opportunities).toHaveLength(0);
    expect(result.refused.some((r) => r.reason === 'internal_venue')).toBe(true);
  });

  it('refuses stale quotes when caller clock exceeds maxQuoteAgeMs', () => {
    const result = scanOmsExternalArb({
      ...scanBody,
      quotes: scanBody.quotes.map((q) => ({ ...q, asOfMs: FRESH_NOW_MS - MAX_QUOTE_AGE_MS - 1 })),
    });
    expect(result.opportunities).toHaveLength(0);
    expect(result.refused.some((r) => r.reason === 'stale_quote')).toBe(true);
  });
});

describe('execution.arb.scan tRPC', () => {
  it('refuses anonymous scan', async () => {
    const router = createExecutionRouter(new SealedHouseTenantRegistry());
    const anon = edgeContext({ headers: { 'x-intafaced-region': 'DE' }, id: 'req-anon' });
    await expect(router.createCaller(anon).execution.arb.scan(scanBody)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('returns wired opportunities for a signed operator', async () => {
    const caller = createExecutionRouter(new SealedHouseTenantRegistry()).createCaller(hmacSigned());
    const out = await caller.execution.arb.scan(scanBody);
    expect(out.symbol).toBe('BTC/USDT');
    expect(out.opportunities[0]?.buyVenueId).toBe('binance');
    expect(out.opportunities[0]?.buyAllIn).toBe('100.05');
  });
});
