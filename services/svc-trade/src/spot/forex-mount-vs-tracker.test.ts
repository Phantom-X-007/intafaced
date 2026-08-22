import { describe, expect, it } from 'vitest';
import {
  FOREX_MOUNTED_DOORS,
  FOREX_TRACKER_ID,
  forexDoorsInRouterSource,
  forexMountVsTrackerBoardCard,
  forexTrackerBackendDoneBarMet,
} from './forex-mount-vs-tracker.js';

describe('trade.forex mount vs tracker honest gaps (D26-P1-T7)', () => {
  it('backend done bar met on tip', () => {
    expect(FOREX_TRACKER_ID).toBe('trade.forex');
    expect(forexDoorsInRouterSource()).toEqual([...FOREX_MOUNTED_DOORS]);
    expect(forexTrackerBackendDoneBarMet()).toBe(true);
    expect(forexMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});
