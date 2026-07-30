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
 *   · `transport.ts` — the two-interface seam that lets the tests produce the
 *     failures a healthy venue never will.
 *   · `venues/binance-spot.ts` — one venue, done properly. Public market data is
 *     live; the trading half refuses loudly rather than pretending.
 */
export * from './sequenced-book.js';
export * from './book-feed.js';
export * from './rate-limit.js';
export * from './latency.js';
export * from './cross-check.js';
export * from './transport.js';
export * from './venues/binance-spot.js';
