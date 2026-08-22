import { describe, expect, it } from 'vitest';
import { RWA_TRACKER_ID, launchRwaMountVsTrackerBoardCard, launchRwaTrackerBackendDoneBarMet } from './rwa-mount-vs-tracker.js';

describe('launch.rwa mount vs tracker (S-G4)', () => {
  it('backend done bar met on tip — licence refuse-closed registry contract', () => {
    expect(RWA_TRACKER_ID).toBe('launch.rwa');
    expect(launchRwaTrackerBackendDoneBarMet()).toBe(true);
    expect(launchRwaMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});
