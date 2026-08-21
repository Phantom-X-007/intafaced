import { describe, expect, it } from 'vitest';
import { SealedHouseTenantRegistry } from '@intafaced/execution-house-tenant';
import { describeExecutionSpine } from './oms-spine.js';
import { createExecutionRouter } from './router.js';

describe('execution.policy route (execution spine honesty door)', () => {
  it('public query mirrors describeExecutionSpine', async () => {
    const result = await createExecutionRouter(new SealedHouseTenantRegistry()).createCaller({}).execution.policy();
    expect(result).toEqual(describeExecutionSpine());
    expect(result.externalOnly).toBe(true);
    expect(result.houseInternalRefuse).toBe(true);
    expect(result.sorUsesVenueAdapterPlanRoute).toBe(true);
  });
});
