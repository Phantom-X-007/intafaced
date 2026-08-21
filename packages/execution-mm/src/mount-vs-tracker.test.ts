import { describe, expect, it } from 'vitest';
import {
  EXECUTION_MM_TRACKER_ID,
  MM_PRODUCT_EXPORTS,
  executionMmMountVsTrackerBoardCard,
  executionMmTrackerBackendDoneBarMet,
  mmDoneBarTestPresent,
  mmExportsInIndexSource,
} from './mount-vs-tracker.js';

describe('execution.market-making mount vs tracker honest gaps (D26-P1-X5)', () => {
  it('backend done bar met on tip', () => {
    expect(EXECUTION_MM_TRACKER_ID).toBe('execution.market-making');
    expect(Array.from(mmExportsInIndexSource()).sort()).toEqual(Array.from(MM_PRODUCT_EXPORTS).sort());
    expect(mmDoneBarTestPresent()).toBe(true);
    expect(executionMmTrackerBackendDoneBarMet()).toBe(true);
    expect(executionMmMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});
