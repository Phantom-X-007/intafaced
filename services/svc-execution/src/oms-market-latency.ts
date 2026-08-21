/**
 * Bridge MarketDataAdapter.latencyGrade → OMS observation.
 *
 * Method absent is a throw, not an F — "we never wired grading on this
 * adapter" must not look like "the venue timed out". `grade: null` passes
 * through. Does not invent routing weight.
 */
import type { MarketDataAdapter, VenueLatencyGrade } from '@intafaced/venue-contracts';

export type OmsLatencyFn = (now?: Date) => VenueLatencyGrade;

export function marketDataAdapterLatency(adapter: MarketDataAdapter): OmsLatencyFn {
  return (now) => {
    if (!adapter.latencyGrade) {
      throw new Error(`${adapter.venue.id}: latencyGrade is not wired on this market-data adapter`);
    }
    return adapter.latencyGrade(now);
  };
}
