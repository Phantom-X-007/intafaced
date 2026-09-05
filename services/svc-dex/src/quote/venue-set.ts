import type { QuoteVenue } from './venue.js';
import { IndexerQuoteVenue } from './indexer-venue.js';
import { MatchingQuoteVenue } from './matching-venue.js';
import { ExternalQuoteVenue, type ExternalVenueConfig } from './external-venue.js';
import { clobCostsFromOptional } from './clob-costs.js';

/** Named refuse when ops have not published the internal-book taker fee. */
export const INTERNAL_BOOK_FEE_UNSET = 'dex.internal_book_fee_unset' as const;

export class InternalBookFeeUnconfiguredError extends Error {
  readonly code = INTERNAL_BOOK_FEE_UNSET;
  constructor() {
    super(
      'dex.internal_book_fee_unset — DEX_INTERNAL_BOOK_FEE_BPS must be set when DEX_INTERNAL_BOOK_ENABLED. A default 20 invents the user cost. Internal book is custodial.',
    );
    this.name = 'InternalBookFeeUnconfiguredError';
  }
}

/** Fields the venue set actually reads — tests stub this without booting loadEnv. */
export interface VenueSetEnv {
  readonly INDEXER_URL: string;
  readonly MATCHING_URL: string;
  /** Unset → no venues attached (fetch timeout is this bound). Never invent 2000. */
  readonly QUOTE_MAX_AGE_MS?: number;
  /** Unset → `quote()` refuses. Never invent 50. Owner-explicit 50 is published. */
  readonly DEX_QUOTE_DEPTH?: number;
  readonly DEX_CLOB_FEE_BPS?: number;
  readonly DEX_CLOB_SETTLEMENT_COST?: string;
  readonly DEX_INTERNAL_BOOK_ENABLED: boolean;
  /** Unset + enabled → `dex.internal_book_fee_unset`. Never invent 20. */
  readonly DEX_INTERNAL_BOOK_FEE_BPS?: number;
  readonly DEX_EXTERNAL_VENUES: readonly ExternalVenueConfig[];
}

/**
 * §27 venue set. CLOB is attached only when its fee schedule is explicit (S-I3).
 * Default shipped config therefore does not quote intachain-clob at 0 bps / 0
 * settlement — that used to understate every on-chain quote.
 */
export function venuesFor(env: VenueSetEnv, region: string): readonly QuoteVenue[] {
  if (env.DEX_INTERNAL_BOOK_ENABLED && env.DEX_INTERNAL_BOOK_FEE_BPS === undefined) {
    throw new InternalBookFeeUnconfiguredError();
  }

  const maxAgeMs = env.QUOTE_MAX_AGE_MS;
  // Fetch timeout is the same published bound as quote freshness. Blank must not
  // hang a venue HTTP call on an invented 2000ms. Quote refuses `max_age_unset`.
  if (typeof maxAgeMs !== 'number' || !Number.isInteger(maxAgeMs) || maxAgeMs < 100 || maxAgeMs > 30_000) {
    return [];
  }

  const venues: QuoteVenue[] = [];

  const clob = clobCostsFromOptional(env.DEX_CLOB_FEE_BPS, env.DEX_CLOB_SETTLEMENT_COST);
  if (clob) {
    venues.push(
      new IndexerQuoteVenue({
        baseUrl: env.INDEXER_URL,
        timeoutMs: maxAgeMs,
        quoteTtlMs: maxAgeMs,
        depth: env.DEX_QUOTE_DEPTH,
        feeBps: clob.feeBps,
        settlementCost: clob.settlementCost,
        region,
      }),
    );
  }

  if (env.DEX_INTERNAL_BOOK_ENABLED) {
    const feeBps = env.DEX_INTERNAL_BOOK_FEE_BPS;
    if (feeBps === undefined) throw new InternalBookFeeUnconfiguredError();
    venues.push(
      new MatchingQuoteVenue({
        baseUrl: env.MATCHING_URL,
        timeoutMs: maxAgeMs,
        quoteTtlMs: maxAgeMs,
        depth: env.DEX_QUOTE_DEPTH,
        feeBps,
      }),
    );
  }

  for (const config of env.DEX_EXTERNAL_VENUES) {
    venues.push(
      new ExternalQuoteVenue({
        config,
        baseUrl: config.depthUrl,
        timeoutMs: maxAgeMs,
        quoteTtlMs: maxAgeMs,
        depth: env.DEX_QUOTE_DEPTH,
      }),
    );
  }

  return venues;
}
