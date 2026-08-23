import { describe, expect, it } from 'vitest';
import {
  FUTURES_HONEST_GAPS,
  FUTURES_MOUNTED_DOORS,
  FUTURES_TRACKER_ID,
  futuresDoorsInRouterSource,
  futuresLiveReleverageMounted,
  futuresMountVsTrackerBoardCard,
  futuresTrackerBackendDoneBarMet,
} from './mount-vs-tracker.js';

describe('trade.futures mount vs tracker honest gaps (D26-P1-T1)', () => {
  it('backend done bar met on tip', () => {
    expect(FUTURES_TRACKER_ID).toBe('trade.futures');
    expect(futuresDoorsInRouterSource()).toEqual([...FUTURES_MOUNTED_DOORS]);
    expect(futuresLiveReleverageMounted()).toBe(true);
    expect(FUTURES_HONEST_GAPS).toEqual([]);
    expect(futuresTrackerBackendDoneBarMet()).toBe(true);
    expect(futuresMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
    expect(futuresMountVsTrackerBoardCard().gaps).toBe(0);
  });
});
