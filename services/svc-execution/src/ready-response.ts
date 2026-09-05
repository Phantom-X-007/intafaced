import { TRADE_BOOK_SNAPSHOT_VENUE_ID } from './trade-book-snapshot.js';
import type { ExecutionVenueCredentialBoard } from './venue-adapters.js';

export const EXECUTION_VENUE_UNPROBED = 'execution.venue_unprobed' as const;
export const EXECUTION_TRADE_BOOK_UNPROBED = 'execution.trade_book_unprobed' as const;

/** Adapter constructed in-process (createAdapter + keys). /ready never pings a venue. */
export type ExecutionConstructedVenueHonesty = {
  readonly status: 'absent' | 'constructed';
  readonly venueIds: readonly string[];
  readonly probe: 'unprobed';
  readonly code: typeof EXECUTION_VENUE_UNPROBED;
};

/** TRADE_URL present is config. /ready never fetches the trade book. */
export type ExecutionTradeBookHonesty =
  | {
      readonly status: 'configured';
      readonly venueId: typeof TRADE_BOOK_SNAPSHOT_VENUE_ID;
      readonly probe: 'unprobed';
      readonly code: typeof EXECUTION_TRADE_BOOK_UNPROBED;
    }
  | {
      readonly status: 'absent';
      readonly venueId: null;
      readonly probe: 'unprobed';
      readonly code: typeof EXECUTION_TRADE_BOOK_UNPROBED;
    };

export function constructedVenueHonesty(venueIds: readonly string[]): ExecutionConstructedVenueHonesty {
  return {
    status: venueIds.length > 0 ? 'constructed' : 'absent',
    venueIds,
    probe: 'unprobed',
    code: EXECUTION_VENUE_UNPROBED,
  };
}

export function tradeBookSnapshotHonesty(tradeUrl: string): ExecutionTradeBookHonesty {
  if (tradeUrl.trim()) {
    return {
      status: 'configured',
      venueId: TRADE_BOOK_SNAPSHOT_VENUE_ID,
      probe: 'unprobed',
      code: EXECUTION_TRADE_BOOK_UNPROBED,
    };
  }
  return {
    status: 'absent',
    venueId: null,
    probe: 'unprobed',
    code: EXECUTION_TRADE_BOOK_UNPROBED,
  };
}

export type ExecutionReadyInput = {
  readonly emsStorePath: string;
  readonly tradeUrl: string;
  readonly venueTradeConstructedVenueIds: readonly string[];
  readonly operatorSupplementVenueIds: readonly string[];
  readonly operatorAccountSupplementVenueIds: readonly string[];
  readonly publicMdSupplementVenueIds: readonly string[];
  readonly venueCredentialBoard: ExecutionVenueCredentialBoard;
  readonly venueAccountConstructedVenueIds: readonly string[];
  readonly venueMarketConstructedVenueIds: readonly string[];
  readonly emsAckCount: number;
};

/** Pure /ready payload — testable without binding a listen port. Constructed adapters and env keys stay unprobed. */
export function buildExecutionReadyResponse(input: ExecutionReadyInput) {
  return {
    ready: true as const,
    stage: 'oms-ems' as const,
    store: input.emsStorePath ? ('file' as const) : ('memory' as const),
    emsStorePath: input.emsStorePath || null,
    internalVenue: 'blocked' as const,
    externalVenueTrade: constructedVenueHonesty(input.venueTradeConstructedVenueIds),
    operatorSupplementVenueIds: input.operatorSupplementVenueIds,
    operatorAccountSupplementVenueIds: input.operatorAccountSupplementVenueIds,
    publicMdSupplementVenueIds: input.publicMdSupplementVenueIds,
    venueCredentialBoard: input.venueCredentialBoard,
    externalVenueAccount: constructedVenueHonesty(input.venueAccountConstructedVenueIds),
    externalVenueMarketData: constructedVenueHonesty(input.venueMarketConstructedVenueIds),
    emsAckCount: input.emsAckCount,
    tradeBookSnapshotVenue: tradeBookSnapshotHonesty(input.tradeUrl),
  };
}
