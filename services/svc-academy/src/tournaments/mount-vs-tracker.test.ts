import { describe, expect, it } from 'vitest';
import {
  TOURNAMENT_MOUNTED_DOORS,
  TOURNAMENTS_TRACKER_ID,
  tournamentDoorsInRouterSource,
  tournamentsMountVsTrackerBoardCard,
  tournamentsTrackerBackendDoneBarMet,
} from './mount-vs-tracker.js';

describe('academy.tournaments mount vs tracker honest gaps (D26-P1-C3)', () => {
  it('backend done bar met on tip — ladder + prize refuse, no invented IFC', () => {
    expect(TOURNAMENTS_TRACKER_ID).toBe('academy.tournaments');
    expect(tournamentDoorsInRouterSource()).toEqual([...TOURNAMENT_MOUNTED_DOORS]);
    expect(tournamentsTrackerBackendDoneBarMet()).toBe(true);
    expect(tournamentsMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});
