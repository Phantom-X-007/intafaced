import { describe, expect, it } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { createAgentsRouter } from '../router.js';
import type { AgentsRouterDeps } from '../router.js';

const SECRET = 'an-agents-growth-route-test-secret-32ch';
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

describe('growth public doors', () => {
  it('propose refuses a dark warehouse — not a live funnel', async () => {
    const result = await createAgentsRouter(stubDeps()).createCaller(signed()).growth.propose({ headline: 'Invite a friend' });
    expect(result.status).toBe('refuse');
    if (result.status !== 'refuse') return;
    expect(result.reason).toBe('warehouse_dark');
    expect(result.isPublication).toBe(false);
    expect(result.published).toBe(false);
  });

  it('propose refuses autonomous publish', async () => {
    const result = await createAgentsRouter(stubDeps())
      .createCaller(signed())
      .growth.propose({ headline: 'Invite a friend', publish: true });
    expect(result).toMatchObject({ status: 'refuse', reason: 'autonomous_publish' });
  });

  it('propose refuses returns-ranked copy', async () => {
    const result = await createAgentsRouter(stubDeps()).createCaller(signed()).growth.propose({ headline: 'returns-ranked leaders' });
    expect(result).toMatchObject({ status: 'refuse', reason: 'returns_claim' });
  });
});
