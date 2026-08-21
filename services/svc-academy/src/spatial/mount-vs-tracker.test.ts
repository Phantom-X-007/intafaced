import { describe, expect, it } from 'vitest';
import {
  academySpatialMountVsTrackerBoardCard,
  academySpatialTrackerBackendDoneBarMet,
  SPATIAL_PRODUCT_SYMBOLS,
  SPATIAL_TRACKER_ID,
  spatialSymbolsInSource,
} from './mount-vs-tracker.js';

describe('academy.spatial mount vs tracker honest gaps (D26-P1-SP1M)', () => {
  it('Stage-1 backend done bar met — schema wired, navigable shell still residual', () => {
    expect(SPATIAL_TRACKER_ID).toBe('academy.spatial');
    expect(spatialSymbolsInSource()).toEqual([...SPATIAL_PRODUCT_SYMBOLS]);
    expect(academySpatialTrackerBackendDoneBarMet()).toBe(true);
    expect(academySpatialMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});
