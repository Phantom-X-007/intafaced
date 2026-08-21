import { describe, expect, it } from 'vitest';
import {
  AFFILIATES_MOUNTED_DOORS,
  AFFILIATES_TRACKER_ID,
  affiliatesDoorsInRouterSource,
  affiliatesMountMatrixComplete,
  affiliatesMountVsTrackerBoardCard,
  affiliatesProducerDoorsInIndexSource,
  affiliatesTrackerBackendDoneBarMet,
} from './mount-vs-tracker.js';

describe('ops.affiliates mount vs tracker honest gaps (D26-P1-O2)', () => {
  it('backend done bar met on tip', () => {
    expect(AFFILIATES_TRACKER_ID).toBe('ops.affiliates');
    expect(affiliatesDoorsInRouterSource().sort()).toEqual([...AFFILIATES_MOUNTED_DOORS].sort());
    expect(affiliatesMountMatrixComplete()).toBe(true);
    expect(affiliatesProducerDoorsInIndexSource()).toBe(true);
    expect(affiliatesTrackerBackendDoneBarMet()).toBe(true);
    expect(affiliatesMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});
