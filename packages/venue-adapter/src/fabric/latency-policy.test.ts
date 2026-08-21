import { describe, expect, it } from 'vitest';
import { describeLatencyGradingPolicy, LATENCY_GRADING_MEASUREMENT } from './latency-policy.js';

describe('describeLatencyGradingPolicy', () => {
  it('states measurement honesty for the SOR weight feed', () => {
    const p = describeLatencyGradingPolicy();
    expect(p.measurement).toBe(LATENCY_GRADING_MEASUREMENT);
    expect(p.measurementNotEstimate).toBe(true);
    expect(p.unscoredRoutingWeightZero).toBe(true);
    expect(p.ungradedIsNotLowScore).toBe(true);
    expect(p.thresholdsOwnerUnruled).toBe(true);
    expect(p.inventsLetterToBpsScaling).toBe(false);
    expect(p.inventsDefaultGrade).toBe(false);
    expect(p.inventsVenueList).toBe(false);
    expect(p.streamLagNotMeasured).toBe(true);
  });
});
