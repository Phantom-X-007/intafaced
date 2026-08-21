import { describe, expect, it } from 'vitest';
import { createAgentsRouter } from '../router.js';
import type { AgentsRouterDeps } from '../router.js';
import { SUPPORT_MONEY_TOOLS } from './guardrail.js';
import { describeSupportPolicy } from './policy.js';
import { createEdgeContext } from '@intafaced/contracts';

function stubDeps(): AgentsRouterDeps {
  return {
    runtime: {} as AgentsRouterDeps['runtime'],
    gateway: { routingTable: { routes: [] } } as unknown as AgentsRouterDeps['gateway'],
    meter: {} as AgentsRouterDeps['meter'],
    feeAssetId: 'IFC',
  };
}

const edgeContext = createEdgeContext({ secret: 'a-policy-route-test-edge-secret-long', serviceName: 'svc-test' });
const anonymous = () => edgeContext({ headers: { 'x-intafaced-region': 'DE' }, id: 'req-anon' });

describe('support.policy route (agents.support honesty door)', () => {
  it('public query mirrors describeSupportPolicy', async () => {
    const expected = describeSupportPolicy();
    const result = await createAgentsRouter(stubDeps()).createCaller(anonymous()).support.policy();
    expect(result).toEqual(expected);
    expect(result.moneyTools).toEqual(SUPPORT_MONEY_TOOLS);
    expect(result.deskProductComplete).toBe(false);
    expect(result.darkPlaneRefuse).toEqual({
      reason: 'desk_plane_dark',
      userMessageKey: 'agents.support.unavailable',
    });
    expect(result.liveAllowedTasks).toEqual(['support.classify', 'support.reply']);
    expect(result).not.toHaveProperty('liveDeskPortOpen');
    expect(result).not.toHaveProperty('tierMatrixPublished');
  });
});
