import { describe, expect, it } from 'vitest';
import {
  academyCurriculumMountVsTrackerBoardCard,
  academyCurriculumTrackerBackendDoneBarMet,
  CURRICULUM_PRODUCT_SYMBOLS,
  CURRICULUM_TRACKER_ID,
  curriculumSymbolsInSource,
} from './mount-vs-tracker.js';

describe('academy.curriculum mount vs tracker honest gaps (D26-P1-C5M)', () => {
  it('backend done bar met on tip — substance bar not char-count theater', () => {
    expect(CURRICULUM_TRACKER_ID).toBe('academy.curriculum');
    expect(curriculumSymbolsInSource()).toEqual([...CURRICULUM_PRODUCT_SYMBOLS]);
    expect(academyCurriculumTrackerBackendDoneBarMet()).toBe(true);
    expect(academyCurriculumMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});
