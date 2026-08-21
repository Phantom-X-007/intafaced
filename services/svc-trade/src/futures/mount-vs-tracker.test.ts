import { describe, expect, it } from 'vitest';
import {
  FUTURES_MOUNTED_DOORS,
  FUTURES_TRACKER_ID,
  futuresDoorsInRouterSource,
  futuresMountVsTrackerBoardCard,
  futuresTrackerBackendDoneBarMet,
} from './mount-vs-tracker.js';

describe('trade.futures mount vs tracker honest gaps (D26-P1-T1)', () => {
  it('backend done bar met on tip', () => {
    expect(FUTURES_TRACKER_ID).toBe('trade.futures');
    expect(futuresDoorsInRouterSource()).toEqual([...FUTURES_MOUNTED_DOORS]);
    expect(futuresTrackerBackendDoneBarMet()).toBe(true);
    expect(futuresMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});
