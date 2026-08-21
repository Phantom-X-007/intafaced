import { describe, expect, it } from 'vitest';
import { OPTIONS_SETTLEMENT_LAW_UNSET } from './options-listing.js';
import { describeOptionsPolicy } from './options-policy.js';

describe('describeOptionsPolicy', () => {
  it('states settlement law gate without inventing assets', () => {
    const unset = describeOptionsPolicy();
    expect(unset.settlementLawUnsetCode).toBe(OPTIONS_SETTLEMENT_LAW_UNSET);
    expect(unset.settlementAssetLawStamped).toBe(false);
    expect(unset.inventsLiveSet).toBe(false);
    expect(unset.inventsSettlementAsset).toBe(false);
    expect(unset.ordersStillRefuseUntilEngine).toBe(true);
  });

  it('reflects non-empty law stamp without parsing it', () => {
    const stamped = describeOptionsPolicy({ settlementAssetLawConfigured: 'opaque-owner-stamp' });
    expect(stamped.settlementAssetLawStamped).toBe(true);
    expect(JSON.stringify(stamped)).not.toContain('opaque-owner-stamp');
  });
});
