import { describe, expect, it } from 'vitest';
import { createAgentsRouter } from '../router.js';
import type { AgentsRouterDeps } from '../router.js';
import { NAVIGATOR_MONEY_WRITE_TOOLS } from './guardrail.js';
import { describeNavigatorPolicy } from './policy.js';
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

describe('navigator.policy route (agents.navigator honesty door)', () => {
  it('public query mirrors describeNavigatorPolicy', async () => {
    const result = await createAgentsRouter(stubDeps()).createCaller(anonymous()).navigator.policy();
    expect(result).toEqual(describeNavigatorPolicy());
    expect(result.moneyWriteTools).toEqual(NAVIGATOR_MONEY_WRITE_TOOLS);
    expect(result.moneyDenyBilledAmount).toBe('0');
    expect(result.darkPlaneRefuse).toEqual({
      reason: 'trade_plane_dark',
      userMessageKey: 'agents.navigator.unavailable',
    });
    expect(result.liveAllowedTasks).toEqual(['navigator.plan', 'navigator.tool_select']);
  });
});
