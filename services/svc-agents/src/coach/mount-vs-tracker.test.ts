import { describe, expect, it } from 'vitest';
import {
  agentsCoachMountVsTrackerBoardCard,
  agentsCoachTrackerBackendDoneBarMet,
  COACH_MOUNTED_DOORS,
  COACH_TRACKER_ID,
  coachDoorsInRouterSource,
} from './mount-vs-tracker.js';

describe('agents.coach mount vs tracker honest gaps (D26-P1-CH1)', () => {
  it('backend done bar met on tip — citations never advice', () => {
    expect(COACH_TRACKER_ID).toBe('agents.coach');
    expect(coachDoorsInRouterSource()).toEqual([...COACH_MOUNTED_DOORS]);
    expect(agentsCoachTrackerBackendDoneBarMet()).toBe(true);
    expect(agentsCoachMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});
