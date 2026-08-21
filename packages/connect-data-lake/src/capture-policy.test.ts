import { describe, expect, it } from 'vitest';
import { CAPTURE_KINDS, describeCapturePolicy } from './capture-policy.js';

describe('describeCapturePolicy', () => {
  it('states capture honesty without promising a time-series store', () => {
    const p = describeCapturePolicy();
    expect(p.captureKinds).toEqual(CAPTURE_KINDS);
    expect(p.unconnectedVenueIsAbsent).toBe(true);
    expect(p.holeNotSyntheticEmptyBook).toBe(true);
    expect(p.noTsdbInPackage).toBe(true);
    expect(p.inventsQuietMarket).toBe(false);
  });
});
