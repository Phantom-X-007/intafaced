import { describe, expect, it } from 'vitest';
import {
  ARB_PRODUCT_EXPORTS,
  EXECUTION_ARB_TRACKER_ID,
  arbExportsInIndexSource,
  arbProductPathComplete,
  executionArbMountVsTrackerBoardCard,
  executionArbTrackerBackendDoneBarMet,
} from './mount-vs-tracker.js';

describe('execution.arbitrage mount vs tracker honest gaps (D26-P1-X4)', () => {
  it('backend done bar met on tip', () => {
    expect(EXECUTION_ARB_TRACKER_ID).toBe('execution.arbitrage');
    expect(Array.from(arbExportsInIndexSource()).sort()).toEqual(Array.from(ARB_PRODUCT_EXPORTS).sort());
    expect(arbProductPathComplete()).toBe(true);
    expect(executionArbTrackerBackendDoneBarMet()).toBe(true);
    expect(executionArbMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});
