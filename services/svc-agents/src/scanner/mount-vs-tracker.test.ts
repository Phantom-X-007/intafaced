import { describe, expect, it } from 'vitest';
import {
  SCANNER_HONEST_GAPS,
  SCANNER_MOUNTED_DOORS,
  SCANNER_TRACKER_ID,
  scannerDoorsInRouterSource,
  scannerMountMatrixComplete,
  scannerMountVsTrackerBoardCard,
  scannerProductionLawRefuseClosed,
  scannerTrackerBackendDoneBarMet,
} from './mount-vs-tracker.js';

describe('scanner mount vs tracker honest gaps (D26-P1-A3)', () => {
  it('names tracker id and honest gap codes', () => {
    expect(SCANNER_TRACKER_ID).toBe('agents.scanner');
    expect(SCANNER_HONEST_GAPS).toContain('gap.class_x_live_tickers_env');
    expect(SCANNER_HONEST_GAPS).toContain('gap.p0_11_allowlist_empty');
  });

  it('backend done bar met — mount + P0-11 refuse-closed + SpotTickersPort on index', () => {
    expect(scannerProductionLawRefuseClosed()).toBe(true);
    expect([scannerDoorsInRouterSource()].sort()).toEqual([...SCANNER_MOUNTED_DOORS].sort());
    expect(scannerMountMatrixComplete()).toBe(true);
    expect(scannerTrackerBackendDoneBarMet()).toBe(true);
    expect(scannerMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
    expect(scannerMountVsTrackerBoardCard().productionLawPublished).toBe(false);
  });
});
