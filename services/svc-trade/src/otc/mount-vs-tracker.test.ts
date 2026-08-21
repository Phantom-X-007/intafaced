import { describe, expect, it } from 'vitest';
import {
  OTC_MOUNTED_DOORS,
  OTC_TRACKER_ID,
  otcDoneBarTestsPresent,
  otcDoorsInRouterSource,
  otcMountVsTrackerBoardCard,
  otcTrackerBackendDoneBarMet,
} from './mount-vs-tracker.js';

describe('trade.otc mount vs tracker honest gaps (D26-P1-T2)', () => {
  it('backend done bar met on tip', () => {
    expect(OTC_TRACKER_ID).toBe('trade.otc');
    expect(otcDoorsInRouterSource().sort()).toEqual([...OTC_MOUNTED_DOORS].sort());
    expect(otcDoneBarTestsPresent()).toBe(true);
    expect(otcTrackerBackendDoneBarMet()).toBe(true);
    expect(otcMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});
