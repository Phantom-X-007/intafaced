import { describe, expect, it } from 'vitest';
import { createAgentsRouter } from '../router.js';
import type { AgentsRouterDeps } from '../router.js';
import { COPY_INTEL_MONEY_WRITE_TOOLS } from './guardrail.js';
import { describeCopyIntelPolicy } from './policy.js';
import { RETURNS_RANKED_BOARD_REFUSE_REASON } from './returns-board-refuse.js';
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

describe('copyIntel.policy route (D26-P1-A5 honesty door)', () => {
  it('public door mirrors describeCopyIntelPolicy without live plane fields', async () => {
    const expected = describeCopyIntelPolicy();
    const result = await createAgentsRouter(stubDeps()).createCaller(anonymous()).copyIntel.policy();
    expect(result).toEqual(expected);
    expect(result.moneyWriteTools).toEqual(COPY_INTEL_MONEY_WRITE_TOOLS);
    expect(result.returnsRankedBoardRefuseReason).toBe(RETURNS_RANKED_BOARD_REFUSE_REASON);
    expect(result.rankedByReturns).toBe(false);
    expect(result).not.toHaveProperty('liveLeaderPlaneOpen');
    expect(result).not.toHaveProperty('noLiveLeaders');
  });
});
