import { describe, expect, it } from 'vitest';
import {
  DROP_FLAGS_PRODUCT_SYMBOLS,
  DROP_FLAGS_TRACKER_ID,
  dropFlagsMountVsTrackerBoardCard,
  dropFlagsSymbolsInSource,
  dropFlagsTrackerBackendDoneBarMet,
} from './drop-flags-mount-vs-tracker.js';

describe('infra.drop-flags mount vs tracker honest gaps (D26-P1-F1)', () => {
  it('backend done bar met on tip — assertEnabled refuse + offReadiness', () => {
    expect(DROP_FLAGS_TRACKER_ID).toBe('infra.drop-flags');
    expect(dropFlagsSymbolsInSource().sort()).toEqual([...DROP_FLAGS_PRODUCT_SYMBOLS].sort());
    expect(dropFlagsTrackerBackendDoneBarMet()).toBe(true);
    expect(dropFlagsMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});
