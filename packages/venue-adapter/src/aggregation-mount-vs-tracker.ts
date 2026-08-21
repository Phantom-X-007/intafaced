/**
 * D26-P1-V1 — venue.aggregation mount vs tracker honest gaps.
 *
 * Public market-data fabric: multi-venue adapter factory, never invent mid.
 * Trading half + live-network CI + M3 risk truth remain Class X residuals.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const VENUE_AGGREGATION_TRACKER_ID = 'venue.aggregation' as const;

export const PUBLIC_VENUE_IDS = ['binance-spot', 'bybit-spot', 'okx-spot'] as const;

export const AGGREGATION_PRODUCT_SYMBOLS = ['createVenueMarketDataAdapter', 'publicVenueBookMid', 'PUBLIC_MARKET_DATA_VENUE_IDS'] as const;

export const AGGREGATION_HONEST_GAPS = ['gap.trading_half_not_ready', 'gap.no_live_network_ci', 'gap.futures_m3_human_risk'] as const;

export function aggregationSymbolsInPackageSource(): readonly (typeof AGGREGATION_PRODUCT_SYMBOLS)[number][] {
  const here = dirname(fileURLToPath(import.meta.url));
  const factorySrc = readFileSync(join(here, 'fabric', 'venues', 'factory.ts'), 'utf8');
  const indexSrc = readFileSync(join(here, 'index.ts'), 'utf8');
  const blob = [factorySrc, indexSrc].join('\n');
  return AGGREGATION_PRODUCT_SYMBOLS.filter((name) => new RegExp(`\\b${name}\\b`).test(blob));
}

export function publicVenueIdsRegistered(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, 'fabric', 'venues', 'factory.ts'), 'utf8');
  return PUBLIC_VENUE_IDS.every((id) => src.includes(`'${id}'`) || src.includes(`"${id}"`));
}

export function noCcxtInMoneyPath(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  const factorySrc = readFileSync(join(here, 'fabric', 'venues', 'factory.ts'), 'utf8');
  return !/from\s+['"]ccxt['"]/.test(factorySrc) && !/require\(['"]ccxt['"]\)/.test(factorySrc);
}

export function aggregationDoneBarTestsPresent(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  const venues = join(here, 'fabric', 'venues');
  return (
    existsSync(join(venues, 'factory.test.ts')) &&
    existsSync(join(venues, 'binance-spot.test.ts')) &&
    existsSync(join(venues, 'bybit-spot.test.ts')) &&
    existsSync(join(here, 'fabric', 'venues', 'null-mid-pin.test.ts'))
  );
}

export function venueAggregationTrackerBackendDoneBarMet(): boolean {
  return (
    aggregationSymbolsInPackageSource().length === AGGREGATION_PRODUCT_SYMBOLS.length &&
    publicVenueIdsRegistered() &&
    noCcxtInMoneyPath() &&
    aggregationDoneBarTestsPresent()
  );
}

export function venueAggregationMountVsTrackerBoardCard(): {
  readonly tracker: typeof VENUE_AGGREGATION_TRACKER_ID;
  readonly symbols: number;
  readonly symbolsPresent: number;
  readonly publicVenues: number;
  readonly gaps: number;
  readonly backendDoneBarMet: boolean;
} {
  const present = aggregationSymbolsInPackageSource();
  return {
    tracker: VENUE_AGGREGATION_TRACKER_ID,
    symbols: AGGREGATION_PRODUCT_SYMBOLS.length,
    symbolsPresent: present.length,
    publicVenues: PUBLIC_VENUE_IDS.length,
    gaps: AGGREGATION_HONEST_GAPS.length,
    backendDoneBarMet: venueAggregationTrackerBackendDoneBarMet(),
  };
}
