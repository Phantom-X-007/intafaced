import { describe, expect, it } from 'vitest';
import {
  DEX_QUOTE_ROUTER_TRACKER_ID,
  QUOTE_MOUNTED_DOORS,
  dexQuoteRouterMountVsTrackerBoardCard,
  dexQuoteRouterTrackerBackendDoneBarMet,
  quoteDoorsInRouterSource,
} from './quote-router-mount-vs-tracker.js';

describe('dex.quote-router mount vs tracker honest gaps (D26-P1-D2)', () => {
  it('backend done bar met on tip — live quote or typed refusal', () => {
    expect(DEX_QUOTE_ROUTER_TRACKER_ID).toBe('dex.quote-router');
    expect(quoteDoorsInRouterSource()).toEqual([...QUOTE_MOUNTED_DOORS]);
    expect(dexQuoteRouterTrackerBackendDoneBarMet()).toBe(true);
    expect(dexQuoteRouterMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});
