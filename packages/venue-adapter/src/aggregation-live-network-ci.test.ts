import { describe, expect, it } from 'vitest';
import {
  venueAggregationLiveNetworkCiWired,
  venueAggregationLiveNetworkSmokeTestPresent,
  venueAggregationLiveNetworkWorkflowPresent,
} from './aggregation-live-network-ci.js';

describe('venue.aggregation live-network CI wiring', () => {
  it('ships workflow + smoke test for public MD venues', () => {
    expect(venueAggregationLiveNetworkWorkflowPresent()).toBe(true);
    expect(venueAggregationLiveNetworkSmokeTestPresent()).toBe(true);
    expect(venueAggregationLiveNetworkCiWired()).toBe(true);
  });
});
