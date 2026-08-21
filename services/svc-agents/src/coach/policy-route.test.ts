import { describe, expect, it } from 'vitest';
import { createAgentsRouter } from '../router.js';
import type { AgentsRouterDeps } from '../router.js';
import { COACH_REFUSE_REASONS, describeCoachPolicy } from './policy.js';
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

describe('coach.policy route (agents.coach honesty door)', () => {
  it('public door mirrors describeCoachPolicy without session fields', async () => {
    const expected = describeCoachPolicy();
    const result = await createAgentsRouter(stubDeps()).createCaller(anonymous()).coach.policy();
    expect(result).toEqual(expected);
    expect(result.refuseReasons).toEqual(COACH_REFUSE_REASONS);
    expect(result.notAdvice).toBe(true);
    expect(result.inventsTradeRecommendations).toBe(false);
    expect(result).not.toHaveProperty('citations');
    expect(result).not.toHaveProperty('licensedLibraryImported');
  });
});
