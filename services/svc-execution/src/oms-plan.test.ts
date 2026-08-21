import { describe, expect, it } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { SealedHouseTenantRegistry } from '@intafaced/execution-house-tenant';
import { latencyGradeWire, planOmsRoute, type OmsPlanVenue } from './oms-plan.js';
import { createExecutionRouter } from './router.js';

const SECRET = 'a-execution-oms-test-edge-secret-long';
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

function completeVenue(over: Partial<OmsPlanVenue> & Pick<OmsPlanVenue, 'id' | 'price'>): OmsPlanVenue {
  return {
    kind: 'external-cex',
    amount: '10',
    feeBps: 10,
    costTerms: {
      feeBps: 10,
      expectedImpactBps: 5,
      transferCostBps: 2,
      latencyGrade: latencyGradeWire(over.id),
    },
    ...over,
  };
}

describe('planOmsRoute', () => {
  it('routes to the cheaper external venue under the complete cost model', async () => {
    const result = await planOmsRoute({
      symbol: 'BTC/USDT',
      side: 'buy',
      amount: '1',
      venues: [completeVenue({ id: 'dear', price: '101' }), completeVenue({ id: 'cheap', price: '100' })],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.venues.map((v) => v.venueId)).toEqual(['cheap']);
    expect(result.report.shortfall).toMatchObject({ kind: 'none' });
  });

  it('refuses internal venues at the OMS door (P0-01)', async () => {
    const result = await planOmsRoute({
      symbol: 'BTC/USDT',
      side: 'buy',
      amount: '1',
      venues: [completeVenue({ id: 'book', price: '90', kind: 'internal' })],
    });
    expect(result).toMatchObject({ ok: false, reason: 'internal_venue' });
  });

  it('refuses a killed house tenant before ranking', async () => {
    const registry = new SealedHouseTenantRegistry();
    registry.register('house-1', 'seed');
    registry.kill('house-1', 'seed');
    const result = await planOmsRoute(
      {
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: '1',
        tenantId: 'house-1',
        venues: [completeVenue({ id: 'street', price: '100' })],
      },
      registry,
    );
    expect(result).toMatchObject({ ok: false, reason: 'kill_switch' });
  });

  it('does not invent fills when depth is short — shortfall is unfilled', async () => {
    const result = await planOmsRoute({
      symbol: 'BTC/USDT',
      side: 'buy',
      amount: '10',
      venues: [completeVenue({ id: 'thin', price: '100', amount: '2' })],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.shortfall).toMatchObject({ kind: 'unfilled', unfilled: '8' });
  });
});

describe('execution.oms.plan tRPC', () => {
  const venueBody = {
    id: 'street',
    kind: 'external-cex' as const,
    price: '100',
    amount: '10',
    feeBps: 10,
    costTerms: {
      feeBps: 10,
      expectedImpactBps: 5,
      transferCostBps: 2,
      latencyGrade: latencyGradeWire('street'),
    },
  };

  it('refuses anonymous plan', async () => {
    const router = createExecutionRouter(new SealedHouseTenantRegistry());
    const anon = edgeContext({ headers: { 'x-intafaced-region': 'DE' }, id: 'req-anon' });
    await expect(
      router.createCaller(anon).execution.oms.plan({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: '1',
        venues: [venueBody],
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('returns an execution report for a signed operator', async () => {
    const caller = createExecutionRouter(new SealedHouseTenantRegistry()).createCaller(signed());
    const out = await caller.execution.oms.plan({
      symbol: 'BTC/USDT',
      side: 'buy',
      amount: '1',
      venues: [venueBody],
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.report.symbol).toBe('BTC/USDT');
    expect(out.report.venues[0]?.venueId).toBe('street');
  });
});
