/**
 * D26-P1-D2 — dex.quote-router mount vs tracker honest gaps.
 *
 * Cross-venue quote sources live prices or typed refusal — never invent mid.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEX_QUOTE_ROUTER_TRACKER_ID = 'dex.quote-router' as const;

export const QUOTE_MOUNTED_DOORS = ['quote'] as const;

export const QUOTE_DONE_BAR_TEST_FILES = [
  'router.mount.test.ts',
  'router-quote.test.ts',
  'quote/quote-service.test.ts',
  'quote/venue-set.test.ts',
] as const;

export const QUOTE_HONEST_GAPS = ['gap.socket_dex_venue_set', 'gap.no_live_external_venue_default'] as const;

export function quoteDoorsInRouterSource(): readonly (typeof QUOTE_MOUNTED_DOORS)[number][] {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, 'router.ts'), 'utf8');
  const start = src.search(/^\s{4}health:\s*publicProcedure/m);
  if (start === -1) return [];
  const block = src.slice(start);
  return QUOTE_MOUNTED_DOORS.filter((door) => new RegExp(`\\b${door}\\s*:`).test(block));
}

export function quoteServiceHonestInSource(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, 'quote', 'quote-service.ts'), 'utf8');
  return /QuoteRefusedError/.test(src) && /sourceQuote/.test(src) && /no_venue_available/.test(src);
}

export function quoteDoneBarTestsPresent(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  return QUOTE_DONE_BAR_TEST_FILES.every((file) => existsSync(join(here, file)));
}

export function dexQuoteRouterTrackerBackendDoneBarMet(): boolean {
  return quoteDoorsInRouterSource().length === QUOTE_MOUNTED_DOORS.length && quoteServiceHonestInSource() && quoteDoneBarTestsPresent();
}

export function dexQuoteRouterMountVsTrackerBoardCard(): {
  readonly tracker: typeof DEX_QUOTE_ROUTER_TRACKER_ID;
  readonly doors: number;
  readonly doorsMounted: number;
  readonly gaps: number;
  readonly backendDoneBarMet: boolean;
} {
  const mounted = quoteDoorsInRouterSource();
  return {
    tracker: DEX_QUOTE_ROUTER_TRACKER_ID,
    doors: QUOTE_MOUNTED_DOORS.length,
    doorsMounted: mounted.length,
    gaps: QUOTE_HONEST_GAPS.length,
    backendDoneBarMet: dexQuoteRouterTrackerBackendDoneBarMet(),
  };
}
