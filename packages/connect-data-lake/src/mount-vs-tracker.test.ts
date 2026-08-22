import { describe, expect, it } from 'vitest';
import {
  connectDataLakeMountVsTrackerBoardCard,
  connectDataLakeTrackerBackendDoneBarMet,
  DATA_LAKE_HONEST_GAPS,
  DATA_LAKE_PACKAGE_EXPORTS,
  DATA_LAKE_TRACKER_ID,
  dataLakeDoneBarTestsPresent,
  dataLakeExportsInIndexSource,
  dataLakeStage1Honest,
} from './mount-vs-tracker.js';

describe('connect.data-lake mount vs tracker honest gaps (D26-P2-DL1)', () => {
  it('Stage-1 backend done bar met on tip — owner-wired TSDB, refuse when blank', () => {
    expect(DATA_LAKE_TRACKER_ID).toBe('connect.data-lake');
    expect(dataLakeExportsInIndexSource()).toEqual([...DATA_LAKE_PACKAGE_EXPORTS]);
    expect(connectDataLakeTrackerBackendDoneBarMet()).toBe(true);
    expect(connectDataLakeMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});

describe('connect.data-lake mount vs tracker gaps board (D53)', () => {
  it('connectDataLakeMountVsTrackerBoardCard names honest gaps without flipping backend done bar', () => {
    const card = connectDataLakeMountVsTrackerBoardCard();
    expect(card.gaps).toBe(DATA_LAKE_HONEST_GAPS.length);
    expect(card.backendDoneBarMet).toBe(true);
    expect(dataLakeDoneBarTestsPresent()).toBe(true);
    expect(dataLakeStage1Honest()).toBe(true);
    expect(DATA_LAKE_HONEST_GAPS).toEqual(['gap.no_tsdb_compose', 'gap.tick_fill_normalisation_pipeline', 'gap.retention_owner_env']);
  });
});
