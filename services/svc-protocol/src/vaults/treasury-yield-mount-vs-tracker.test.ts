import { describe, expect, it } from 'vitest';
import {
  TREASURY_YIELD_TRACKER_ID,
  launchTreasuryYieldMountVsTrackerBoardCard,
  launchTreasuryYieldTrackerBackendDoneBarMet,
} from './treasury-yield-mount-vs-tracker.js';

describe('launch.treasury-yield mount vs tracker (S-L5)', () => {
  it('backend done bar met on tip — licence refuse-closed vault contract', () => {
    expect(TREASURY_YIELD_TRACKER_ID).toBe('launch.treasury-yield');
    expect(launchTreasuryYieldTrackerBackendDoneBarMet()).toBe(true);
    expect(launchTreasuryYieldMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});
