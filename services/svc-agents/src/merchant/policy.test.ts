import { describe, expect, it } from 'vitest';
import { describeMerchantPolicy } from './policy.js';

describe('describeMerchantPolicy — agents.merchant honesty door', () => {
  it('declares read-only pay tools and denies money writes', () => {
    const policy = describeMerchantPolicy();
    expect(policy.agentId).toBe('merchant');
    expect(policy.declaredTools).toContain('pay.metrics.read');
    expect(policy.moneyWriteTools).toContain('pay.capture');
    expect(policy.inventsApprovalRate).toBe(false);
  });

  it('names live metrics and dark pay plane refuses', () => {
    const policy = describeMerchantPolicy();
    expect(policy.liveMetricsRequired).toBe(true);
    expect(policy.liveMetricsRefuseReason).toBe('no_live_metrics');
    expect(policy.darkPayPlaneRefuseReason).toBe('pay_plane_dark');
  });
});
