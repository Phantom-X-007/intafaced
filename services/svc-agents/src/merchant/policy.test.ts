import { describe, expect, it } from 'vitest';
import { MERCHANT_MONEY_WRITE_TOOLS } from './guardrail.js';
import { describeMerchantPolicy } from './policy.js';
import { MERCHANT_WATCH_REFUSE } from './watch.js';

describe('describeMerchantPolicy — agents.merchant honesty door', () => {
  it('exposes money-write denylist and watch refuse catalog', () => {
    const policy = describeMerchantPolicy();
    expect(policy.moneyWriteTools).toEqual(MERCHANT_MONEY_WRITE_TOOLS);
    expect(policy.moneyDeny.hasLedgerPost).toBe(1);
    expect(policy.moneyDeny.hasPayRouteChange).toBe(1);
    expect(policy.watchRefuseReasons).toEqual(Object.values(MERCHANT_WATCH_REFUSE));
    expect(policy.inventsApprovalRate).toBe(false);
    expect(policy.allowedTask).toBe('merchant.watch');
  });

  it('names live metrics and dark pay plane refuses', () => {
    const policy = describeMerchantPolicy();
    expect(policy.liveMetricsRefuseReason).toBe('no_live_metrics');
    expect(policy.darkPayPlaneRefuseReason).toBe('pay_plane_dark');
    expect(policy.watchRefuse.hasNoMetrics).toBe(1);
    expect(policy.watchRefuse.hasPayPlaneDark).toBe(1);
    expect(policy.moneyDenyExport.startsWith('tools,ledger_post,pay_route_change')).toBe(true);
  });
});
