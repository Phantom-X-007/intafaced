import { describe, expect, it } from 'vitest';
import {
  OPTIONS_MOUNTED_DOORS,
  OPTIONS_TRACKER_ID,
  optionsDoorsInRouterSource,
  optionsMountVsTrackerBoardCard,
  optionsTrackerBackendDoneBarMet,
} from './options-mount-vs-tracker.js';

describe('trade.options mount vs tracker honest gaps (D26-P1-T4)', () => {
  it('backend done bar met on tip', () => {
    expect(OPTIONS_TRACKER_ID).toBe('trade.options');
    expect(optionsDoorsInRouterSource()).toEqual([...OPTIONS_MOUNTED_DOORS]);
    expect(optionsTrackerBackendDoneBarMet()).toBe(true);
    expect(optionsMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});
