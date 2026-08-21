import { describe, expect, it } from 'vitest';
import {
  academyLobbiesMountVsTrackerBoardCard,
  academyLobbiesTrackerBackendDoneBarMet,
  LOBBIES_PRODUCT_SYMBOLS,
  LOBBIES_TRACKER_ID,
  lobbiesSymbolsInSource,
} from './mount-vs-tracker.js';

describe('academy.lobbies mount vs tracker honest gaps (D26-P1-LB1)', () => {
  it('backend done bar met on tip — seats gated, stream refuses not fakes', () => {
    expect(LOBBIES_TRACKER_ID).toBe('academy.lobbies');
    expect(lobbiesSymbolsInSource()).toEqual([...LOBBIES_PRODUCT_SYMBOLS]);
    expect(academyLobbiesTrackerBackendDoneBarMet()).toBe(true);
    expect(academyLobbiesMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});
