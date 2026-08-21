import { describe, expect, it } from 'vitest';
import { createAgentsRouter } from '../router.js';
import type { AgentsRouterDeps } from '../router.js';
import { P0_11_BOARD_ID, SCANNER_SIGNAL_INPUTS_LAW_RESIDUAL } from './signal-inputs-law.js';
import { describeScannerPolicy } from './policy.js';
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

describe('scanner.policy route (agents.scanner honesty door)', () => {
  it('public query mirrors describeScannerPolicy', async () => {
    const result = await createAgentsRouter(stubDeps()).createCaller(anonymous()).scanner.policy();
    expect(result).toEqual(describeScannerPolicy());
    expect(result.boardId).toBe(P0_11_BOARD_ID);
    expect(result.productionDefaultPublished).toBe(false);
    expect(result.inventsRankings).toBe(false);
    expect(result.inventsLiveTickers).toBe(false);
    expect(result.liveTickersClassX).toBe(true);
    expect(result.residual).toBe(SCANNER_SIGNAL_INPUTS_LAW_RESIDUAL);
  });
});
