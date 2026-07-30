import { parseAmount, type Amount } from '@intafaced/ledger-client/money';

/**
 * THE DECIMAL DISCIPLINE, IN ONE PLACE.
 *
 * §27 asks for our own CCXT-class layer rather than CCXT itself, and the
 * concrete reason — the one that would cost a user money rather than offend a
 * doctrine — lives in this file.
 *
 * CCXT's unified surface returns JavaScript `number`. Every venue worth reading
 * publishes its book, its balances and its funding rate as decimal STRINGS;
 * a unified layer that parses them to floats before a caller sees them has
 * already lost digits nothing downstream can recover. `0.1 + 0.2 !== 0.3` and
 * an order book is nothing but sums.
 *
 * So a JSON number is not coerced here. It is REFUSED, at the wire, with the
 * venue named. A refusal is a page for whoever is on call; a coercion is a
 * fill that is wrong in the last decimal place and looks perfect in a log.
 *
 * Every adapter in the fabric reads its venue through these functions. There is
 * no second road in.
 */

/** Unsigned decimal, at most 18 places — the same rule svc-matching's router states. */
const UNSIGNED_DECIMAL = /^\d+(\.\d{1,18})?$/;

/** Signed decimal. Funding rates and PnL are the fields that go negative. */
const SIGNED_DECIMAL = /^-?\d+(\.\d{1,18})?$/;

/**
 * Why a venue's payload could not be read as money.
 *
 * Carries the venue and the field so an operator can tell "this venue changed
 * its schema" from "this venue is down", which are different incidents.
 */
export class VenueDecimalError extends Error {
  constructor(
    readonly venueId: string,
    readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = 'VenueDecimalError';
  }
}

function refuse(venueId: string, field: string, message: string): never {
  throw new VenueDecimalError(venueId, field, `${venueId}.${field}: ${message}`);
}

/**
 * A decimal string → scaled bigint, or a refusal.
 *
 * The `typeof value === 'number'` branch is the whole point of the module and
 * is deliberately checked before the regex: a caller who passes `30000.1` gets
 * an error naming the actual problem rather than a confusing "not a string".
 */
export function readDecimal(value: unknown, venueId: string, field: string): Amount {
  if (typeof value === 'number') {
    refuse(venueId, field, 'is a JSON number — a number cannot carry a price without losing digits (§27, Doctrine 5)');
  }
  if (typeof value !== 'string') {
    refuse(venueId, field, `is ${value === null ? 'null' : typeof value}, expected a decimal string`);
  }
  if (!UNSIGNED_DECIMAL.test(value)) {
    refuse(venueId, field, `"${value}" is not an unsigned decimal string with at most 18 places`);
  }
  return parseAmount(value);
}

/** As `readDecimal`, but the value is allowed to be negative. Funding, PnL, skew. */
export function readSignedDecimal(value: unknown, venueId: string, field: string): Amount {
  if (typeof value === 'number') {
    refuse(venueId, field, 'is a JSON number — a number cannot carry money without losing digits (§27, Doctrine 5)');
  }
  if (typeof value !== 'string') {
    refuse(venueId, field, `is ${value === null ? 'null' : typeof value}, expected a decimal string`);
  }
  if (!SIGNED_DECIMAL.test(value)) {
    refuse(venueId, field, `"${value}" is not a signed decimal string with at most 18 places`);
  }
  return parseAmount(value);
}

/** `readDecimal`, but `undefined` and `null` pass through as `null`. */
export function readOptionalDecimal(value: unknown, venueId: string, field: string): Amount | null {
  if (value === undefined || value === null) return null;
  return readDecimal(value, venueId, field);
}

/**
 * An integer that is NOT money — a sequence number, a fee in bps, a count.
 *
 * These may legitimately arrive as JSON numbers, because an integer inside
 * `Number.MAX_SAFE_INTEGER` survives `JSON.parse` exactly. The bound is
 * enforced rather than assumed: venue sequence numbers are the field most
 * likely to cross 2^53 on a busy market, and a sequence that has silently
 * become approximate defeats every gap check downstream.
 */
export function readInteger(value: unknown, venueId: string, field: string): number {
  // `Number('')` is 0, `Number('  7 ')` is 7 and `Number(null)` is 0. Each turns
  // a malformed payload into a plausible sequence number — and a plausible
  // sequence is precisely what the gap checker downstream cannot see through.
  // Match the digits explicitly instead of trusting the coercion.
  if (typeof value === 'string' && !/^-?\d+$/.test(value)) {
    refuse(venueId, field, `"${value}" is not an integer`);
  }
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isInteger(parsed)) {
    refuse(venueId, field, `is not an integer (got ${JSON.stringify(value)})`);
  }
  if (!Number.isSafeInteger(parsed)) {
    refuse(venueId, field, `${parsed} exceeds the safe integer range — a sequence past 2^53 cannot be compared reliably`);
  }
  return parsed;
}

/** `[price, quantity]` — scaled bigint, never `number`. */
export type PriceLevel = readonly [price: Amount, quantity: Amount];

/**
 * `[["30000.5","2.25"], …]` → sorted, positive-price levels.
 *
 * Two invariants a caller may then rely on, both cheap and both load-bearing:
 *
 *   · **Every level is a pair of decimal strings.** See the header.
 *   · **Levels are sorted away from the spread.** A sweep walks levels in order
 *     and stops when it is filled; hand it asks that are not ascending and it
 *     fills against the wrong prices and returns a cost that is confidently
 *     wrong — no error, no gap, just a bad number. Venues do sort correctly
 *     today. Sorting again costs microseconds and removes the dependency on
 *     that staying true through a schema change nobody told us about.
 *
 * Zero-quantity levels are DROPPED in a snapshot and PRESERVED by the delta
 * path (`sequenced-book.ts`), because in a snapshot a zero level is noise and
 * in a delta it is the only encoding of removal. Those two readings cannot
 * share a function, which is why this one is snapshot-only.
 */
export function readLevels(raw: unknown, side: 'bids' | 'asks', venueId: string): PriceLevel[] {
  if (!Array.isArray(raw)) refuse(venueId, side, 'is not an array');

  const levels: PriceLevel[] = [];

  for (const level of raw) {
    if (!Array.isArray(level) || level.length < 2) {
      refuse(venueId, side, 'contains a level that is not a [price, quantity] pair');
    }
    const price = readDecimal(level[0], venueId, `${side}.price`);
    const quantity = readDecimal(level[1], venueId, `${side}.quantity`);

    // A zero or negative price is not a level, it is a broken venue. Refusing
    // the whole response is right: half a book prices as confidently as a whole
    // one and there is nothing in the result to say which it was.
    if (price <= 0n) refuse(venueId, side, `carries a non-positive price "${String(level[0])}"`);
    if (quantity === 0n) continue;

    levels.push([price, quantity]);
  }

  levels.sort((a, b) => {
    if (a[0] === b[0]) return 0;
    return side === 'bids' ? (a[0] > b[0] ? -1 : 1) : a[0] < b[0] ? -1 : 1;
  });

  return levels;
}
