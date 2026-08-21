import { describe, expect, it } from 'vitest';
import {
  INSTRUMENT_MOUNTED_DOORS,
  P2P_INSTRUMENTS_TRACKER_ID,
  instrumentDoorsInRouterSource,
  p2pInstrumentsMountVsTrackerBoardCard,
  p2pInstrumentsTrackerBackendDoneBarMet,
} from './instruments-mount-vs-tracker.js';

describe('p2p.payment-instruments mount vs tracker honest gaps (D26-P1-P4)', () => {
  it('backend done bar met on tip', () => {
    expect(P2P_INSTRUMENTS_TRACKER_ID).toBe('p2p.payment-instruments');
    expect(instrumentDoorsInRouterSource().sort()).toEqual([...INSTRUMENT_MOUNTED_DOORS].sort());
    expect(p2pInstrumentsTrackerBackendDoneBarMet()).toBe(true);
    expect(p2pInstrumentsMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});
