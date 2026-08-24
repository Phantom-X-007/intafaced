/**
 * venue.aggregation trading half policy — signed trade factory contract (§27 / D27-P4).
 *
 * Consolidates the trading-half posture from `venues/factory.ts`. Every public
 * market-data venue id has a trade adapter; unknown ids refuse; credentials are
 * never invented. Live network still needs operator-issued keys.
 */
import { PUBLIC_MARKET_DATA_VENUE_IDS, createVenueTradeAdapter } from './factory.js';

export type TradingHalfPolicySummary = ReturnType<typeof describeTradingHalfPolicy>;

/** Public contract board for venue.aggregation trading half. */
export function describeTradingHalfPolicy() {
  return {
    tradingVenueIds: [...PUBLIC_MARKET_DATA_VENUE_IDS],
    tradeFactoryCoversAllPublicMarketDataVenues: true as const,
    sameIdsAsPublicMarketData: true as const,
    unknownVenueIdRefuses: true as const,
    offNoneFalseRefuses: true as const,
    inventsCredentials: false as const,
    inventsVenueList: false as const,
    inventsAdapterForUnknownId: false as const,
    liveCredentialsOperatorIssued: true as const,
    placeOrderRequiresPayoutGradeBook: true as const,
  };
}

/** Trade adapter factory must return non-null for every registered public MD id. */
export function tradeAdapterRegisteredForAllPublicVenues(): boolean {
  return PUBLIC_MARKET_DATA_VENUE_IDS.every((id) => createVenueTradeAdapter(id) !== null);
}

/** Refuse-closed: off / none / false / unknown ids must not construct a trade adapter. */
export function shouldRefuseTradeAdapterConstruction(venueId: string): boolean {
  return createVenueTradeAdapter(venueId) === null;
}
