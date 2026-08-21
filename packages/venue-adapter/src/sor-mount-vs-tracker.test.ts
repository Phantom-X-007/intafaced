import { describe, expect, it } from 'vitest';
import {
  EXECUTION_SOR_TRACKER_ID,
  SOR_PRODUCT_EXPORTS,
  executionSorMountVsTrackerBoardCard,
  executionSorTrackerBackendDoneBarMet,
  sorDoneBarTestsPresent,
  sorExportsInPackageSource,
} from './sor-mount-vs-tracker.js';

describe('execution.sor mount vs tracker honest gaps (D26-P1-X3)', () => {
  it('backend done bar met on tip', () => {
    expect(EXECUTION_SOR_TRACKER_ID).toBe('execution.sor');
    expect(sorExportsInPackageSource().sort()).toEqual([...SOR_PRODUCT_EXPORTS].sort());
    expect(sorDoneBarTestsPresent()).toBe(true);
    expect(executionSorTrackerBackendDoneBarMet()).toBe(true);
    expect(executionSorMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});
