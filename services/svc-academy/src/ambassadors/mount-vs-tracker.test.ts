import { describe, expect, it } from 'vitest';
import {
  academyAmbassadorsMountVsTrackerBoardCard,
  academyAmbassadorsTrackerBackendDoneBarMet,
  AMBASSADORS_PRODUCT_SYMBOLS,
  AMBASSADORS_TRACKER_ID,
  ambassadorsSymbolsInSource,
} from './mount-vs-tracker.js';

describe('academy.ambassadors mount vs tracker honest gaps (D26-P1-C2M)', () => {
  it('backend done bar met on tip — rates owner-published or refused', () => {
    expect(AMBASSADORS_TRACKER_ID).toBe('academy.ambassadors');
    expect(ambassadorsSymbolsInSource()).toEqual([...AMBASSADORS_PRODUCT_SYMBOLS]);
    expect(academyAmbassadorsTrackerBackendDoneBarMet()).toBe(true);
    expect(academyAmbassadorsMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});
