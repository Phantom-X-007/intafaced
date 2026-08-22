/**
 * THE VENUE FABRIC — §27 INTAFACED CONNECT, runtime half.
 *
 * `@intafaced/venue-contracts` holds the types. This holds the machinery that
 * makes them safe to use:
 *
 *   · `sequenced-book.ts` — a book that WITHHOLDS itself the moment it can no
 *     longer prove it matches the venue's. The one property everything else
 *     depends on.
 *   · `book-feed.ts` — subscribe, buffer, snapshot, join, resnapshot on a gap,
 *     and STOP rather than storm a broken venue.
 *   · `rate-limit.ts` — a per-venue governor that refuses rather than silently
 *     waits, because getting banned mid-execution is an outage we caused.
 *   · `latency.ts` — continuous grading on round-trip, rejects and staleness,
 *     wired into routing through `VenueHealth` and nothing else.
 *   · `latency-policy.ts` — connect.latency-grading honesty door (D-S-18).
 *     Measurement not estimate; thresholds owner-unruled.
 *   · `cross-check.ts` — a median across venues, so a venue that is fresh,
 *     sequenced and simply WRONG is caught by the only thing that can catch it.
 *   · `payout-grade.ts` — absolute notional floor for a two-sided book. Dust
 *     levels that would mint a mid are refused at the adapter (`no_depth`), not
 *     only downstream in svc-trade's mark gate (D26-P1-T8).
 *   · `capture-lake.ts` — §27:762 capture honesty. A missing / failed capture is
 *     a typed HOLE in the record; an empty book is only written when a connected
 *     adapter returned one. Never substitutes empty depth for absence (D-S-18).
 *     No TSDB — store choice remains open.
 *   · `capture-lake-policy.ts` — connect.data-lake fabric honesty door (D-S-18).
 *     Hole vs quiet market; no TSDB/retention claims; no invented mids.
 *   · `transport.ts` — the two-interface seam that lets the tests produce the
 *     failures a healthy venue never will.
 *   · `venues/binance-spot.ts` — the first venue, done properly. Public market
 *     data is live; the trading half refuses loudly rather than pretending.
 *   · `venues/bybit-spot.ts` — the SECOND venue, public market data only. It is
 *     what makes `latency.ts` mean something: a grade with nothing to rank
 *     against is a number.
 *   · `venues/okx-spot.ts` — the THIRD venue, public market data only. Two
 *     venues leave `cross-check.ts` inconclusive by construction (the median of
 *     two is their midpoint). Three make the median a check.
 *   · `venues/factory.ts` — `createVenueMarketDataAdapter`. An adapter written
 *     and unregistered is a file, not a venue.
 *   · `venues/factory-policy.ts` — venue.aggregation honesty door. Public
 *     market-data ids from the factory; unknown ids refuse; no invented list.
 *   · `venues/trading-half-policy.ts` — venue.aggregation trading half contract
 *     (D27-P4). Trade factory covers every public MD id; ops keys still required.
 */
export * from './sequenced-book.js';
export * from './book-feed.js';
export * from './rate-limit.js';
export * from './latency.js';
export * from './latency-policy.js';
export * from './cross-check.js';
export * from './payout-grade.js';
export * from './capture-lake.js';
export * from './capture-lake-policy.js';
export * from './capture-lake-bridge.js';
export * from './transport.js';
export * from './venues/binance-spot.js';
export * from './venues/bybit-spot.js';
export {
  OkxSpotMarketData,
  OkxSpotTrade,
  okxSymbolOf,
  capDepth,
  OKX_SPOT_RATE_LIMIT,
  type OkxSpotOptions,
  type OkxSpotTradeOptions,
} from './venues/okx-spot.js';
export * from './venues/factory.js';
export * from './venues/factory-policy.js';
export * from './venues/trading-half-policy.js';
export * from './venues/trading-half-policy.js';
