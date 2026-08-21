import { describe, expect, it } from 'vitest';
import {
  COPY_MOUNTED_DOORS,
  COPY_TRACKER_ID,
  copyDoorsInRouterSource,
  copyMountMatrixComplete,
  copyMountVsTrackerBoardCard,
  copyPolicyHonest,
  copyTrackerBackendDoneBarMet,
} from './mount-vs-tracker.js';

describe('trade.copy mount vs tracker honest gaps (D26-P1-T3)', () => {
  it('backend done bar met on tip', () => {
    expect(COPY_TRACKER_ID).toBe('trade.copy');
    expect(copyPolicyHonest()).toBe(true);
    expect(copyDoorsInRouterSource().sort()).toEqual([...COPY_MOUNTED_DOORS].sort());
    expect(copyMountMatrixComplete()).toBe(true);
    expect(copyTrackerBackendDoneBarMet()).toBe(true);
    expect(copyMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});
