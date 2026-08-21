import { describe, expect, it } from 'vitest';
import {
  AGGREGATION_PRODUCT_SYMBOLS,
  PUBLIC_VENUE_IDS,
  VENUE_AGGREGATION_TRACKER_ID,
  aggregationSymbolsInPackageSource,
  venueAggregationMountVsTrackerBoardCard,
  venueAggregationTrackerBackendDoneBarMet,
} from './aggregation-mount-vs-tracker.js';

describe('venue.aggregation mount vs tracker honest gaps (D26-P1-V1)', () => {
  it('backend done bar met on tip — multi-venue public fabric', () => {
    expect(VENUE_AGGREGATION_TRACKER_ID).toBe('venue.aggregation');
    expect(aggregationSymbolsInPackageSource().sort()).toEqual([...AGGREGATION_PRODUCT_SYMBOLS].sort());
    expect(PUBLIC_VENUE_IDS.length).toBeGreaterThanOrEqual(2);
    expect(venueAggregationTrackerBackendDoneBarMet()).toBe(true);
    expect(venueAggregationMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});
