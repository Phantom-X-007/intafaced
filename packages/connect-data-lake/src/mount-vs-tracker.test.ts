import { describe, expect, it } from 'vitest';
import {
  connectDataLakeMountVsTrackerBoardCard,
  connectDataLakeTrackerBackendDoneBarMet,
  DATA_LAKE_PACKAGE_EXPORTS,
  DATA_LAKE_TRACKER_ID,
  dataLakeExportsInIndexSource,
} from './mount-vs-tracker.js';

describe('connect.data-lake mount vs tracker honest gaps (D26-P2-DL1)', () => {
  it('Stage-1 backend done bar met on tip — capture only, no TSDB', () => {
    expect(DATA_LAKE_TRACKER_ID).toBe('connect.data-lake');
    expect(dataLakeExportsInIndexSource()).toEqual([...DATA_LAKE_PACKAGE_EXPORTS]);
    expect(connectDataLakeTrackerBackendDoneBarMet()).toBe(true);
    expect(connectDataLakeMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});
