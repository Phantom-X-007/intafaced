import { describe, expect, it } from 'vitest';
import { channelSocketMatrixComplete } from './channels/mountain-vs-sockets.js';
import {
  NOTIFY_MOUNTED_DOORS,
  NOTIFY_TRACKER_ID,
  notifyDoorsInRouterSource,
  notifyMountMatrixComplete,
  notifyMountVsTrackerBoardCard,
  notifyTrackerBackendDoneBarMet,
} from './mount-vs-tracker.js';

describe('ops.notifications mount vs tracker honest gaps (D26-P1-O5)', () => {
  it('backend done bar met on tip', () => {
    expect(NOTIFY_TRACKER_ID).toBe('ops.notifications');
    expect(channelSocketMatrixComplete()).toBe(true);
    expect([notifyDoorsInRouterSource()].sort()).toEqual([...NOTIFY_MOUNTED_DOORS].sort());
    expect(notifyMountMatrixComplete()).toBe(true);
    expect(notifyTrackerBackendDoneBarMet()).toBe(true);
    expect(notifyMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});
