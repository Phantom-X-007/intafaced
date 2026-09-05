/**
 * venue.aggregation trading half — payout-grade gate before signed place (P-05).
 *
 * MD adapters already refuse dust on snapshotBook. Trade adapters must not
 * bypass that gate when submitting — quote-only is not Done.
 */
import { VenueUnavailableError } from '@intafaced/venue-contracts';
import { assertPayoutGradeBook } from './payout-grade.js';
import { createVenueMarketDataAdapter } from './venues/factory.js';
import type { HttpPort } from './transport.js';

export type TradePayoutGateOptions = {
  readonly http?: HttpPort;
  readonly clock?: () => number;
  /** Snapshot depth. Unset is forwarded — Binance refuses rather than inventing 1000. */
  readonly limit?: number | null;
};

/** Refuse place when the live book is not payout-grade (D26-P1-T8 floor). */
export async function assertTradeBookPayoutGradeBeforePlace(
  venueId: string,
  symbol: string,
  options: TradePayoutGateOptions = {},
): Promise<void> {
  const md = createVenueMarketDataAdapter(venueId, options);
  if (!md) {
    throw new VenueUnavailableError(venueId, 'not_ready', `${venueId}: no market-data adapter for payout-grade trade gate`);
  }
  const snapshot = await md.snapshotBook(symbol, options.limit ?? undefined);
  assertPayoutGradeBook(snapshot);
}
