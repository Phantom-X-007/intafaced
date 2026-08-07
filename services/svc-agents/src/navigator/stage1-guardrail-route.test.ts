import { describe, expect, it } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { createAgentsRouter } from '../router.js';
import type { AgentsRouterDeps } from '../router.js';
import { NAVIGATOR_MONEY_WRITE_TOOLS } from './guardrail.js';
import { SUPPORT_MONEY_TOOLS } from '../support-agent/guardrail.js';

const SECRET = 'an-agents-stage1-guardrail-mount-test-edge-secret-long';
const USER = '11111111-1111-4111-8111-111111111111';
const edgeContext = createEdgeContext({ secret: SECRET, serviceName: 'svc-agents' });

function principal(): Principal {
  return {
    sub: USER,
    userId: USER,
    sid: '22222222-2222-4222-8222-222222222222',
    scopes: ['agents:read'],
    tier: 'none',
    mfa: false,
    expiresAt: new Date(Date.now() + 60_000),
  } as Principal;
}

function signed() {
  const raw = encodePrincipal(principal());
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

describe('stage1Guardrail routes', () => {
  it('navigator grants read tools only — no money writes', async () => {
    const g = await createAgentsRouter(stubDeps()).createCaller(signed()).navigator.stage1Guardrail();
    expect(g.agentId).toBe('navigator');
    expect(g.tools.length).toBeGreaterThan(0);
    expect(g.tools.every((t) => t.mode === 'read')).toBe(true);
    const names = new Set(g.tools.map((t) => t.name));
    for (const banned of NAVIGATOR_MONEY_WRITE_TOOLS) {
      expect(names.has(banned)).toBe(false);
    }
  });

  it('support never grants money tools', async () => {
    const g = await createAgentsRouter(stubDeps()).createCaller(signed()).support.stage1Guardrail();
    expect(g.agentId).toBe('support');
    const names = new Set(g.tools.map((t) => t.name));
    for (const banned of SUPPORT_MONEY_TOOLS) {
      expect(names.has(banned)).toBe(false);
    }
  });
});
