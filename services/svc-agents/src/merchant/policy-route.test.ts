import { describe, expect, it } from 'vitest';
import { createAgentsRouter } from '../router.js';
import type { AgentsRouterDeps } from '../router.js';
import { MERCHANT_MONEY_WRITE_TOOLS } from './guardrail.js';
import { describeMerchantPolicy } from './policy.js';
import { MERCHANT_WATCH_REFUSE } from './watch.js';

function stubDeps(): AgentsRouterDeps {
  return {
    runtime: {} as AgentsRouterDeps['runtime'],
    gateway: { routingTable: { routes: [] } } as unknown as AgentsRouterDeps['gateway'],
    meter: {} as AgentsRouterDeps['meter'],
    feeAssetId: 'IFC',
  };
}

describe('merchant.policy route (D26-P1-A4 honesty door)', () => {
  it('public door mirrors describeMerchantPolicy without live metrics port fields', async () => {
    const expected = describeMerchantPolicy();
    const result = await createAgentsRouter(stubDeps()).createCaller({}).merchant.policy();
    expect(result).toEqual(expected);
    expect(result.moneyWriteTools).toEqual(MERCHANT_MONEY_WRITE_TOOLS);
    expect(result.watchRefuseReasons).toEqual(Object.values(MERCHANT_WATCH_REFUSE));
    expect(result.inventsApprovalRate).toBe(false);
    expect(result).not.toHaveProperty('liveMetricsPortConfigured');
    expect(result).not.toHaveProperty('approvalRate');
  });
});
