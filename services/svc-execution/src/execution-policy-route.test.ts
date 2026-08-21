import { describe, expect, it } from 'vitest';
import { SealedHouseTenantRegistry } from '@intafaced/execution-house-tenant';
import { describeExecutionSpine } from './oms-spine.js';
import { createExecutionRouter } from './router.js';
import { createEdgeContext } from '@intafaced/contracts';

const edgeContext = createEdgeContext({ secret: 'a-policy-route-test-edge-secret-long', serviceName: 'svc-test' });
const anonymous = () => edgeContext({ headers: { 'x-intafaced-region': 'DE' }, id: 'req-anon' });

describe('execution.policy route (execution spine honesty door)', () => {
  it('public query mirrors describeExecutionSpine', async () => {
    const result = await createExecutionRouter(new SealedHouseTenantRegistry()).createCaller(anonymous()).execution.policy();
    expect(result).toEqual(describeExecutionSpine());
    expect(result.externalOnly).toBe(true);
    expect(result.houseInternalRefuse).toBe(true);
    expect(result.sorUsesVenueAdapterPlanRoute).toBe(true);
  });
});
