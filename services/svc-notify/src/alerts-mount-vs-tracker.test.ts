import { describe, expect, it } from 'vitest';
import {
  ALERTS_MOUNTED_DOORS,
  ALERTS_TRACKER_ID,
  alertsDoorsInRouterSource,
  alertsMountVsTrackerBoardCard,
  alertsSweepMountedInIndex,
  alertsTrackerBackendDoneBarMet,
} from './alerts-mount-vs-tracker.js';

describe('v22.alerts mount vs tracker honest gaps (D26-P1-A1)', () => {
  it('backend done bar met on tip — price watch doors + sweep driver wired', () => {
    expect(ALERTS_TRACKER_ID).toBe('v22.alerts');
    expect(alertsDoorsInRouterSource()).toEqual([...ALERTS_MOUNTED_DOORS]);
    expect(alertsSweepMountedInIndex()).toBe(true);
    expect(alertsTrackerBackendDoneBarMet()).toBe(true);
    expect(alertsMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});
