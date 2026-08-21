import { describe, expect, it } from 'vitest';
import { describeLatencyGradingPolicy } from './latency-policy.js';

describe('describeLatencyGradingPolicy', () => {
  it('states measurement honesty for SOR weight feed', () => {
    const p = describeLatencyGradingPolicy();
    expect(p.measurementNotEstimate).toBe(true);
    expect(p.unscoredRoutingWeightZero).toBe(true);
    expect(p.inventsDefaultGrade).toBe(false);
    expect(p.inventsVenueList).toBe(false);
  });
});
