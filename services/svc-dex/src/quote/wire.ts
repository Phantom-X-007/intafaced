import { parseAmount } from '@intafaced/ledger-client/money';
import type { BookLevel } from './venue.js';
import { VenueUnavailableError } from './venue.js';

/**
 * READING A BOOK OFF A WIRE, SUSPICIOUSLY.
 *
 * Shared by every adapter, because every adapter has the same two jobs and the
 * same two ways of getting them wrong.
 *
 * ── 1 · A JSON number is never a price ──────────────────────────────────────
 *
 * The wire between two of our own services is still a wire. `30000.000000000001`
 * as a JSON number is already a float by the time `JSON.parse` returns it, and
 * no amount of care downstream gets the lost digits back. So a level that is not
 * a pair of decimal STRINGS is a rejected response, not a coerced one — a
 * coercion is invisible until the eighteenth decimal place decides a fill.
 *
 * ── 2 · Order is not taken on trust ─────────────────────────────────────────
 *
 * A sweep walks levels in order and stops when it is filled. Hand it asks that
 * are not ascending and it fills against the wrong prices and returns a cost
 * that is confidently wrong — no error, no gap, just a bad number. Upstreams
 * here do sort correctly today; sorting again costs microseconds and removes the
 * dependency on that staying true.
 */

/** Positive decimal, at most 18 places. The same rule svc-matching's own router states. */
const DECIMAL = /^\d+(\.\d{1,18})?$/;

function fail(venueId: string, message: string): never {
  throw new VenueUnavailableError(venueId, 'malformed', message);
}

/**
 * `[["30000.5","2.25"], …]` → sorted, positive-only levels.
 *
 * Zero-quantity levels are dropped rather than kept: a level with nothing on it
 * contributes nothing to a sweep, and keeping it would let an "empty" book look
 * deep in a levels count.
 */
export function parseLevels(raw: unknown, side: 'bids' | 'asks', venueId: string): BookLevel[] {
  if (!Array.isArray(raw)) fail(venueId, `${side} is not an array`);

  const levels: BookLevel[] = [];

  for (const level of raw) {
    if (!Array.isArray(level) || level.length !== 2) fail(venueId, `${side} level is not a [price, quantity] pair`);

    const [price, quantity] = level as [unknown, unknown];
    if (typeof price !== 'string' || typeof quantity !== 'string') {
      fail(venueId, `${side} level is not a pair of strings — a JSON number cannot carry a price`);
    }
    if (!DECIMAL.test(price) || !DECIMAL.test(quantity)) {
      fail(venueId, `${side} level ["${price}","${quantity}"] is not a pair of decimal strings`);
    }

    const p = parseAmount(price);
    const q = parseAmount(quantity);
    // A zero or negative price is not a level, it is a broken venue. Refusing
    // the whole response is right: half a book prices as confidently as a
    // whole one and there is nothing in the result to say which it was.
    if (p <= 0n) fail(venueId, `${side} carries a non-positive price "${price}"`);
    if (q < 0n) fail(venueId, `${side} carries a negative quantity "${quantity}"`);
    if (q === 0n) continue;

    levels.push([p, q]);
  }

  // Bids descend, asks ascend — both away from the spread, which is the order a
  // sweep must consume them in.
  levels.sort((a, b) => (side === 'bids' ? (b[0] > a[0] ? 1 : b[0] < a[0] ? -1 : 0) : a[0] > b[0] ? 1 : a[0] < b[0] ? -1 : 0));

  return levels;
}

export interface HttpVenueOptions {
  readonly baseUrl: string;
  /**
   * Per-request ceiling.
   *
   * Defaulted to the quote staleness ceiling by the callers, and that is not a
   * coincidence: a fetch that takes longer than `QUOTE_MAX_AGE_MS` produces a
   * book that is already too old to price against the moment it lands. Waiting
   * longer than the answer can be valid for only converts a fast refusal into a
   * slow one.
   */
  readonly timeoutMs: number;
  /** Injected in tests. */
  readonly fetch?: typeof globalThis.fetch;
}

/**
 * GET JSON, or throw `VenueUnavailableError`.
 *
 * Note what is NOT sent: no `Authorization`, no service HMAC. Both upstreams
 * serve their read surfaces to anyone who can reach the port — svc-matching
 * authenticates order writes only, and every svc-indexer procedure is
 * `publicJurisdictionProcedure` over public chain state. This process therefore
 * needs no credential, and because it needs none it is not given one. The
 * absence is the security property (the same argument `svc-ws`'s depth client
 * makes).
 */
export async function getJson(
  venueId: string,
  url: string,
  options: HttpVenueOptions,
  headers: Record<string, string> = {},
): Promise<unknown> {
  const doFetch = options.fetch ?? globalThis.fetch;

  let response: Response;
  try {
    response = await doFetch(url, {
      signal: AbortSignal.timeout(options.timeoutMs),
      headers: { accept: 'application/json', ...headers },
    });
  } catch (err) {
    throw new VenueUnavailableError(venueId, 'unreachable', `${venueId} unreachable: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!response.ok) {
    throw new VenueUnavailableError(venueId, 'unreachable', `${venueId} answered ${response.status}`);
  }

  try {
    return await response.json();
  } catch (err) {
    throw new VenueUnavailableError(venueId, 'malformed', `${venueId} returned unparseable JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function trimBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}
