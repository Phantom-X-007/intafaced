import { describe, expect, it } from 'vitest';
import {
  ANALYTICS_PRODUCT_SYMBOLS,
  ANALYTICS_TRACKER_ID,
  analyticsSymbolsInWarehouseSource,
  opsAnalyticsMountVsTrackerBoardCard,
  opsAnalyticsTrackerBackendDoneBarMet,
} from './ops-analytics-mount-vs-tracker.js';

describe('ops.analytics mount vs tracker honest gaps (D26-P1-O4M)', () => {
  it('backend done bar met on tip — warehouse never invents live cubes', () => {
    expect(ANALYTICS_TRACKER_ID).toBe('ops.analytics');
    expect(analyticsSymbolsInWarehouseSource()).toEqual([...ANALYTICS_PRODUCT_SYMBOLS]);
    expect(opsAnalyticsTrackerBackendDoneBarMet()).toBe(true);
    expect(opsAnalyticsMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});
