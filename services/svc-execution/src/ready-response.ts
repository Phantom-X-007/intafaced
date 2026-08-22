import { TRADE_BOOK_SNAPSHOT_VENUE_ID } from './trade-book-snapshot.js';
import type { ExecutionVenueCredentialBoardEntry } from './venue-adapters.js';

export type ExecutionReadyInput = {
  readonly emsStorePath: string;
  readonly tradeUrl: string;
  readonly venueTradeWiredVenueIds: readonly string[];
  readonly operatorSupplementVenueIds: readonly string[];
  readonly venueCredentialBoard: {
    readonly venues: readonly ExecutionVenueCredentialBoardEntry[];
    readonly wiredVenueIds: readonly string[];
    readonly inventsCredentials: false;
  };
  readonly venueAccountWiredVenueIds: readonly string[];
  readonly venueMarketWiredVenueIds: readonly string[];
  readonly emsAckCount: number;
};

/** Pure /ready payload — testable without binding a listen port. */
export function buildExecutionReadyResponse(input: ExecutionReadyInput) {
  return {
    ready: true as const,
    stage: 'oms-ems' as const,
    store: input.emsStorePath ? ('file' as const) : ('memory' as const),
    emsStorePath: input.emsStorePath || null,
    internalVenue: 'blocked' as const,
    externalVenueTrade: input.venueTradeWiredVenueIds,
    operatorSupplementVenueIds: input.operatorSupplementVenueIds,
    venueCredentialBoard: input.venueCredentialBoard,
    externalVenueAccount: input.venueAccountWiredVenueIds,
    externalVenueMarketData: input.venueMarketWiredVenueIds,
    emsAckCount: input.emsAckCount,
    tradeBookSnapshotVenue: input.tradeUrl ? TRADE_BOOK_SNAPSHOT_VENUE_ID : null,
  };
}
