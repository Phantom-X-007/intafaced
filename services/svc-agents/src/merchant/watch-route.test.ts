import { describe, expect, it } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { createAgentsRouter } from '../router.js';
import type { AgentsRouterDeps } from '../router.js';

/**
 * Merchant Stage-1 tRPC wire — mirror of #1011 copy-intel.
 * Fixtures + dark pay-plane refuse; no invent live approval rates; no pay.routing.
 */

const SECRET = 'an-agents-merchant-mount-test-edge-secret-long';
const USER = '11111111-1111-4111-8111-111111111111';
const edgeContext = createEdgeContext({ secret: SECRET, serviceName: 'svc-agents' });

function signed() {
  const p = {
    sub: USER,
    userId: USER,
    sid: '22222222-2222-4222-8222-222222222222',
    scopes: ['agents:read'],
    tier: 'none',
    mfa: false,
    expiresAt: new Date(Date.now() + 60_000),
  } as Principal;
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

function stubDeps(): AgentsRouterDeps {
  return {
    runtime: {} as AgentsRouterDeps['runtime'],
    gateway: { routingTable: { routes: [] } } as unknown as AgentsRouterDeps['gateway'],
    meter: {} as AgentsRouterDeps['meter'],
    feeAssetId: 'IFC',
  };
}

const point = {
  railId: 'card-a',
  approvalRate: '0.70',
  attempts: 200,
  asOf: '2026-08-07T11:59:00.000Z',
  maxAgeMs: 120_000,
};

describe('merchant.watch route (Stage-1 fixtures)', () => {
  it('watches fixtures and alerts below threshold — no rail change', async () => {
    const result = await createAgentsRouter(stubDeps())
      .createCaller(signed())
      .merchant.watch({
        points: [point, { ...point, railId: 'card-b', approvalRate: '0.99' }],
        threshold: '0.85',
        now: '2026-08-07T12:00:00.000Z',
      });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0]?.railId).toBe('card-a');
    expect(result.alerts[0]?.kind).toBe('below_threshold');
  });

  it('dark pay plane refuses invent rates', async () => {
    const result = await createAgentsRouter(stubDeps())
      .createCaller(signed())
      .merchant.watch({ points: [point], payPlane: 'dark' });
    expect(result).toMatchObject({ status: 'unavailable', reason: 'pay_plane_dark' });
  });

  it('empty points → empty (never invent rails)', async () => {
    const result = await createAgentsRouter(stubDeps()).createCaller(signed()).merchant.watch({ points: [] });
    expect(result).toEqual({ status: 'empty', userMessageKey: 'agents.merchant.empty' });
  });

  it('D26-P1-A4: missing rate on wire refuses — no partial alerts', async () => {
    const result = await createAgentsRouter(stubDeps())
      .createCaller(signed())
      .merchant.watch({
        points: [point, { ...point, railId: 'card-b', approvalRate: null, attempts: null }],
        threshold: '0.85',
        now: '2026-08-07T12:00:00.000Z',
      });
    expect(result).toEqual({
      status: 'unavailable',
      userMessageKey: 'agents.merchant.unavailable',
      reason: 'no_metrics',
    });
  });

  it('D26-P1-A4 deepen: mixed stale on wire refuses — no partial alerts', async () => {
    const result = await createAgentsRouter(stubDeps())
      .createCaller(signed())
      .merchant.watch({
        points: [
          point,
          {
            ...point,
            railId: 'card-b',
            approvalRate: '0.99',
            asOf: '2026-08-07T10:00:00.000Z',
            maxAgeMs: 60_000,
          },
        ],
        threshold: '0.85',
        now: '2026-08-07T12:00:00.000Z',
      });
    expect(result).toEqual({
      status: 'unavailable',
      userMessageKey: 'agents.merchant.unavailable',
      reason: 'stale',
    });
  });
});
