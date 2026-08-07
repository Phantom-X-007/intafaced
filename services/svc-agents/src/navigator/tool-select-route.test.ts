import { describe, expect, it } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { createAgentsRouter } from '../router.js';
import type { AgentsRouterDeps } from '../router.js';

const SECRET = 'an-agents-tool-select-mount-test-edge-secret-long';
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

const tools = [
  { name: 'trade.quote', module: 'trade', mode: 'read' as const },
  { name: 'trade.place', module: 'trade', mode: 'write' as const },
];

describe('navigator.selectTools route', () => {
  it('selects declared read tools; refuses write and undeclared', async () => {
    const result = await createAgentsRouter(stubDeps())
      .createCaller(signed())
      .navigator.selectTools({
        plane: 'live',
        candidates: ['trade.quote', 'trade.place', 'unknown.tool'],
        tools,
      });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.selected).toEqual(['trade.quote']);
    expect(result.refused.map((r) => r.reason).sort()).toEqual(['not_declared', 'write_mode']);
  });

  it('dark plane refuses invent', async () => {
    const result = await createAgentsRouter(stubDeps())
      .createCaller(signed())
      .navigator.selectTools({ plane: 'dark', candidates: ['trade.quote'], tools });
    expect(result).toMatchObject({ status: 'refuse', reason: 'trade_plane_dark' });
  });

  it('empty candidates refuse', async () => {
    const result = await createAgentsRouter(stubDeps())
      .createCaller(signed())
      .navigator.selectTools({ plane: 'live', candidates: [], tools });
    expect(result).toEqual({ status: 'refuse', reason: 'no_candidates' });
  });
});
