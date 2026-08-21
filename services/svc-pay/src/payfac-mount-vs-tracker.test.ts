import { describe, expect, it } from 'vitest';
import {
  PAYFAC_PRODUCT_SYMBOLS,
  PAY_PAYFAC_TRACKER_ID,
  payPayfacMountVsTrackerBoardCard,
  payPayfacTrackerBackendDoneBarMet,
  payfacSymbolsInProductSource,
} from './payfac-mount-vs-tracker.js';

describe('pay.payfac mount vs tracker honest gaps (D26-P1-P2)', () => {
  it('backend done bar met on tip', () => {
    expect(PAY_PAYFAC_TRACKER_ID).toBe('pay.payfac');
    expect(payfacSymbolsInProductSource().sort()).toEqual([...PAYFAC_PRODUCT_SYMBOLS].sort());
    expect(payPayfacTrackerBackendDoneBarMet()).toBe(true);
    expect(payPayfacMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});
