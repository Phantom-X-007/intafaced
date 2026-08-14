import { describe, expect, it } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { createAgentsRouter } from '../router.js';
import type { AgentsRouterDeps } from '../router.js';

const SECRET = 'an-agents-coach-route-test-secret-32chars';
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

describe('coach public doors', () => {
  it('session refuses when curriculum grounding is empty — not a chatbot', async () => {
    const result = await createAgentsRouter(stubDeps()).createCaller(signed()).coach.session({ ask: 'explain risk' });
    expect(result.status).toBe('refuse');
    if (result.status !== 'refuse') return;
    expect(result.reason).toBe('curriculum_empty');
    expect(result.kind).toBe('not_advice');
    expect(result.isAdvice).toBe(false);
    expect(result.inventedLibrary).toBe(false);
    expect(result.licensedLibraryImported).toBe(false);
    expect(result.positionsReferenced).toBe(false);
  });

  it('session refuses position-grounded coaching', async () => {
    const result = await createAgentsRouter(stubDeps())
      .createCaller(signed())
      .coach.session({ ask: 'what about my holdings', includePositions: true });
    expect(result).toMatchObject({ status: 'refuse', reason: 'positions_not_decided' });
  });

  it('session refuses asAdvice', async () => {
    const result = await createAgentsRouter(stubDeps())
      .createCaller(signed())
      .coach.session({ requestedSlug: 'foundations-risk-first', asAdvice: true });
    expect(result).toMatchObject({ status: 'refuse', reason: 'advice_forbidden' });
  });
});
