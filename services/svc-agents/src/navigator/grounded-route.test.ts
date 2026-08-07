import { describe, expect, it } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { createAgentsRouter } from '../router.js';
import type { AgentsRouterDeps } from '../router.js';

const SECRET = 'an-agents-navigator-mount-test-edge-secret-long';
const USER = '11111111-1111-4111-8111-111111111111';
const edgeContext = createEdgeContext({ secret: SECRET, serviceName: 'svc-agents' });

function principal(overrides: Partial<Principal> = {}): Principal {
  return {
    sub: USER,
    userId: USER,
    sid: '22222222-2222-4222-8222-222222222222',
    scopes: ['agents:read'],
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

function stubDeps(): AgentsRouterDeps {
  return {
    runtime: {} as AgentsRouterDeps['runtime'],
    gateway: { routingTable: { routes: [] } } as unknown as AgentsRouterDeps['gateway'],
    meter: {} as AgentsRouterDeps['meter'],
    feeAssetId: 'IFC',
  };
}

describe('navigator.grounded route (Stage-2 plane gate)', () => {
  it('live allows plan/tool_select tasks', async () => {
    const result = await createAgentsRouter(stubDeps()).createCaller(signed()).navigator.grounded({ plane: 'live' });
    expect(result).toEqual({
      status: 'ok',
      plane: 'live',
      allowedTasks: ['navigator.plan', 'navigator.tool_select'],
    });
  });

  it('dark refuses invent market context', async () => {
    const result = await createAgentsRouter(stubDeps()).createCaller(signed()).navigator.grounded({ plane: 'dark' });
    expect(result).toEqual({
      status: 'refuse',
      plane: 'dark',
      reason: 'trade_plane_dark',
      userMessageKey: 'agents.navigator.unavailable',
    });
  });
});
