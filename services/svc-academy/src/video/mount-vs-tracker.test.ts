import { describe, expect, it } from 'vitest';
import {
  academyVideoMountVsTrackerBoardCard,
  academyVideoTrackerBackendDoneBarMet,
  VIDEO_HONEST_GAPS,
  VIDEO_PRODUCT_SYMBOLS,
  VIDEO_TRACKER_ID,
  videoSymbolsInSource,
} from './mount-vs-tracker.js';

describe('academy.video mount vs tracker honest gaps', () => {
  it('backend done bar met — signed VOD, unconfigured named refuse, store listing residual', () => {
    expect(VIDEO_TRACKER_ID).toBe('academy.video');
    expect(videoSymbolsInSource()).toEqual([...VIDEO_PRODUCT_SYMBOLS]);
    expect(VIDEO_HONEST_GAPS).toContain('gap.store_listing_class_x');
    expect(academyVideoTrackerBackendDoneBarMet()).toBe(true);
    expect(academyVideoMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});
