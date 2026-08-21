import { describe, expect, it } from 'vitest';
import {
  PAY_ROUTING_TRACKER_ID,
  ROUTING_MOUNTED_DOORS,
  ROUTING_PRODUCT_SYMBOLS,
  payRoutingMountVsTrackerBoardCard,
  payRoutingTrackerBackendDoneBarMet,
  routingDoorsInRouterSource,
  routingDoneBarTestsPresent,
  routingSymbolsInProductSource,
} from './mount-vs-tracker.js';

describe('pay.routing mount vs tracker honest gaps (D26-P1-P3)', () => {
  it('backend done bar met on tip', () => {
    expect(PAY_ROUTING_TRACKER_ID).toBe('pay.routing');
    expect(routingDoorsInRouterSource().sort()).toEqual([...ROUTING_MOUNTED_DOORS].sort());
    expect(routingSymbolsInProductSource().sort()).toEqual([...ROUTING_PRODUCT_SYMBOLS].sort());
    expect(routingDoneBarTestsPresent()).toBe(true);
    expect(payRoutingTrackerBackendDoneBarMet()).toBe(true);
    expect(payRoutingMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});
