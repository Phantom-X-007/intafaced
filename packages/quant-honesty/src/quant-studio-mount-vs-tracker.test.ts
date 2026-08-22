import { describe, expect, it } from 'vitest';
import {
  QUANT_STUDIO_HONEST_GAPS,
  QUANT_STUDIO_TRACKER_ID,
  quantStudioMountVsTrackerBoardCard,
  quantStudioTrackerBackendDoneBarMet,
} from './quant-studio-mount-vs-tracker.js';

describe('quant.studio mount vs tracker (D-S-18 contract boundary)', () => {
  it('connect.data-lake dependency met; refusal contract shipped; builder/sandbox gaps remain', () => {
    expect(QUANT_STUDIO_TRACKER_ID).toBe('quant.studio');
    expect(quantStudioTrackerBackendDoneBarMet()).toBe(true);
    expect(quantStudioMountVsTrackerBoardCard().dataLakeDependencyMet).toBe(true);
    expect(QUANT_STUDIO_HONEST_GAPS).toEqual(['gap.no_visual_builder', 'gap.sandbox_escape_suite']);
  });
});
