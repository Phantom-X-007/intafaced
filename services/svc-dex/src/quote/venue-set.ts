import type { QuoteVenue } from './venue.js';
import { IndexerQuoteVenue } from './indexer-venue.js';
import { MatchingQuoteVenue } from './matching-venue.js';
import { ExternalQuoteVenue, type ExternalVenueConfig } from './external-venue.js';
import { clobCostsFromOptional } from './clob-costs.js';

/** Fields the venue set actually reads — tests stub this without booting loadEnv. */
export interface VenueSetEnv {
  readonly INDEXER_URL: string;
  readonly MATCHING_URL: string;
  readonly QUOTE_MAX_AGE_MS: number;
  readonly DEX_CLOB_FEE_BPS?: number;
  readonly DEX_CLOB_SETTLEMENT_COST?: string;
  readonly DEX_INTERNAL_BOOK_ENABLED: boolean;
  readonly DEX_INTERNAL_BOOK_FEE_BPS: number;
  readonly DEX_EXTERNAL_VENUES: readonly ExternalVenueConfig[];
}

/**
 * §27 venue set. CLOB is attached only when its fee schedule is explicit (S-I3).
 * Default shipped config therefore does not quote intachain-clob at 0 bps / 0
 * settlement — that used to understate every on-chain quote.
 */
export function venuesFor(env: VenueSetEnv, region: string): readonly QuoteVenue[] {
  const venues: QuoteVenue[] = [];

  const clob = clobCostsFromOptional(env.DEX_CLOB_FEE_BPS, env.DEX_CLOB_SETTLEMENT_COST);
  if (clob) {
    venues.push(
      new IndexerQuoteVenue({
        baseUrl: env.INDEXER_URL,
        timeoutMs: env.QUOTE_MAX_AGE_MS,
        quoteTtlMs: env.QUOTE_MAX_AGE_MS,
        feeBps: clob.feeBps,
        settlementCost: clob.settlementCost,
        region,
      }),
    );
  }

  if (env.DEX_INTERNAL_BOOK_ENABLED) {
    venues.push(
      new MatchingQuoteVenue({
        baseUrl: env.MATCHING_URL,
        timeoutMs: env.QUOTE_MAX_AGE_MS,
        quoteTtlMs: env.QUOTE_MAX_AGE_MS,
        feeBps: env.DEX_INTERNAL_BOOK_FEE_BPS,
      }),
    );
  }

  for (const config of env.DEX_EXTERNAL_VENUES) {
    venues.push(
      new ExternalQuoteVenue({
        config,
        baseUrl: config.depthUrl,
        timeoutMs: env.QUOTE_MAX_AGE_MS,
        quoteTtlMs: env.QUOTE_MAX_AGE_MS,
      }),
    );
  }

  return venues;
}
