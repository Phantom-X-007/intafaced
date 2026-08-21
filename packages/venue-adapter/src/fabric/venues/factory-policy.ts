/**
 * venue.aggregation product policy — public market-data factory honesty (§27).
 *
 * Consolidates the public posture from `venues/factory.ts`. Unknown ids refuse;
 * credentials are never invented.
 */
import { PUBLIC_MARKET_DATA_VENUE_IDS } from './factory.js';

export type VenueAggregationPolicySummary = ReturnType<typeof describeVenueAggregationPolicy>;

/** Public honesty board for venue-adapter public market-data factory. */
export function describeVenueAggregationPolicy() {
  return {
    publicMarketDataVenueIds: [...PUBLIC_MARKET_DATA_VENUE_IDS],
    unknownVenueIdRefuses: true as const,
    offNoneFalseRefuses: true as const,
    publicMarketDataOnly: true as const,
    signedTradeSeparateFactory: true as const,
    inventsCredentials: false as const,
    inventsVenueList: false as const,
    inventsAdapterForUnknownId: false as const,
  };
}
