import { describe, expect, it } from 'vitest';
import { BUSINESS_ROLES, describeBusinessPolicy } from './business-policy.js';

describe('describeBusinessPolicy — bank.business honesty door', () => {
  it('states maker/checker dual control without inventing thresholds', () => {
    const p = describeBusinessPolicy();
    expect(p.roles).toEqual(BUSINESS_ROLES);
    expect(p.dualControlOverThreshold).toBe(true);
    expect(p.holdBeforeCheckerApprove).toBe(true);
    expect(p.makerCannotSelfApprove).toBe(true);
    expect(p.inventsDefaultThreshold).toBe(false);
    expect(p.underThresholdPostsImmediately).toBe(true);
  });

  it('names threshold as per-account owner law', () => {
    const p = describeBusinessPolicy();
    expect(p.thresholdPerAccountOwnerLaw).toBe(true);
    expect(p.inventsDefaultThreshold).toBe(false);
  });
});
