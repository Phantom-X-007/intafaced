import { describe, expect, it } from 'vitest';
import {
  OPS_SUPPORT_MOUNTED_DOORS,
  OPS_SUPPORT_TRACKER_ID,
  opsSupportDoorsInRouterSource,
  opsSupportMountMatrixComplete,
  opsSupportMountVsTrackerBoardCard,
  opsSupportTrackerBackendDoneBarMet,
} from './mount-vs-tracker.js';

describe('ops.support mount vs tracker honest gaps (D26-P1-O3)', () => {
  it('backend done bar met on tip — ticket+KB+audit+identity doors mounted', () => {
    expect(OPS_SUPPORT_TRACKER_ID).toBe('ops.support');
    expect([...opsSupportDoorsInRouterSource()].slice().sort()).toEqual([...OPS_SUPPORT_MOUNTED_DOORS].slice().sort());
    expect(opsSupportMountMatrixComplete()).toBe(true);
    expect(opsSupportTrackerBackendDoneBarMet()).toBe(true);
    expect(opsSupportMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});
