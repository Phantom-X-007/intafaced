import { describe, expect, it } from 'vitest';
import {
  agentsLaunchMountVsTrackerBoardCard,
  agentsLaunchTrackerBackendDoneBarMet,
  LAUNCH_MOUNTED_DOORS,
  LAUNCH_AGENT_TRACKER_ID,
  launchDoorsInRouterSource,
} from './mount-vs-tracker.js';

describe('agents.launch mount vs tracker honest gaps (D26-P1-LA1)', () => {
  it('backend done bar met on tip — empty history is not a clean badge', () => {
    expect(LAUNCH_AGENT_TRACKER_ID).toBe('agents.launch');
    expect(launchDoorsInRouterSource()).toEqual([...LAUNCH_MOUNTED_DOORS]);
    expect(agentsLaunchTrackerBackendDoneBarMet()).toBe(true);
    expect(agentsLaunchMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});
