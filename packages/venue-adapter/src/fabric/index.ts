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
 *   · `cross-check.ts` — a median across venues, so a venue that is fresh,
 *     sequenced and simply WRONG is caught by the only thing that can catch it.
 *   · `payout-grade.ts` — absolute notional floor for a two-sided book. Dust
 *     levels that would mint a mid are refused at the adapter (`no_depth`), not
 *     only downstream in svc-trade's mark gate (D26-P1-T8).
 *   · `transport.ts` — the two-interface seam that lets the tests produce the
 *     failures a healthy venue never will.
 *   · `venues/binance-spot.ts` — the first venue, done properly. Public market
 *     data is live; the trading half refuses loudly rather than pretending.
 *   · `venues/bybit-spot.ts` — the SECOND venue, public market data only. It is
 *     what makes `latency.ts` and `cross-check.ts` mean something: a grade with
 *     nothing to rank against is a number, and a median of one venue is that
 *     venue's opinion of itself.
 */
export * from './sequenced-book.js';
export * from './book-feed.js';
export * from './rate-limit.js';
export * from './latency.js';
export * from './cross-check.js';
export * from './payout-grade.js';
export * from './transport.js';
export * from './venues/binance-spot.js';
export * from './venues/bybit-spot.js';
