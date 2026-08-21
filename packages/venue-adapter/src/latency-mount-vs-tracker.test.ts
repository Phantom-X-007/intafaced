import { describe, expect, it } from 'vitest';
import {
  LATENCY_GRADING_TRACKER_ID,
  LATENCY_PRODUCT_SYMBOLS,
  latencyGradingMountVsTrackerBoardCard,
  latencyGradingTrackerBackendDoneBarMet,
  latencyDoneBarTestsPresent,
  latencySymbolsInFabricSource,
  sorConsumesLatencyGrade,
} from './latency-mount-vs-tracker.js';

describe('connect.latency-grading mount vs tracker honest gaps (D26-P1-X1)', () => {
  it('backend done bar met on tip — SOR consumes graded latency', () => {
    expect(LATENCY_GRADING_TRACKER_ID).toBe('connect.latency-grading');
    expect([latencySymbolsInFabricSource()].sort()).toEqual([...LATENCY_PRODUCT_SYMBOLS].sort());
    expect(sorConsumesLatencyGrade()).toBe(true);
    expect(latencyDoneBarTestsPresent()).toBe(true);
    expect(latencyGradingTrackerBackendDoneBarMet()).toBe(true);
    expect(latencyGradingMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});
