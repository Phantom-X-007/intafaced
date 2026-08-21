import { describe, expect, it } from 'vitest';
import {
  ALERTS_MOUNTED_DOORS,
  V22_ALERTS_TRACKER_ID,
  alertsDoorsInRouterSource,
  v22AlertsMountVsTrackerBoardCard,
  v22AlertsTrackerBackendDoneBarMet,
} from './alerts-mount-vs-tracker.js';

describe('v22.alerts mount vs tracker honest gaps (D26-P1-A1)', () => {
  it('backend done bar met on tip — price watch sweep mounted', () => {
    expect(V22_ALERTS_TRACKER_ID).toBe('v22.alerts');
    expect(alertsDoorsInRouterSource()).toEqual([...ALERTS_MOUNTED_DOORS]);
    expect(v22AlertsTrackerBackendDoneBarMet()).toBe(true);
    expect(v22AlertsMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});
