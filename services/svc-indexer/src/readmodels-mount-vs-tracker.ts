/**
 * D26-P1-I3 — indexer.readmodels mount vs tracker honest gaps.
 *
 * Chain→Postgres read models mounted with reorg honesty; no fake live books.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const INDEXER_READMODELS_TRACKER_ID = 'indexer.readmodels' as const;

export const READMODELS_MOUNTED_DOORS = ['health', 'status', 'book', 'fills', 'positions'] as const;

export const READMODELS_DONE_BAR_TEST_FILES = ['router.mount.test.ts', 'd26-p1-i3-done-bar.test.ts'] as const;

export const READMODELS_HONEST_GAPS = ['gap.socket_clob_contracts', 'gap.indexer_venue_address_unset'] as const;

export function readmodelsDoorsInRouterSource(): readonly (typeof READMODELS_MOUNTED_DOORS)[number][] {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, 'router.ts'), 'utf8');
  const start = src.search(/^\s{4}health:\s*publicProcedure/m);
  if (start === -1) return [];
  const next = src.slice(start + 1).search(/^\s{4}amm:\s*router\(\{/m);
  const block = next === -1 ? src.slice(start) : src.slice(start, start + 1 + next);
  return READMODELS_MOUNTED_DOORS.filter((door) => new RegExp(`\\b${door}\\s*:`).test(block));
}

export function readmodelsPublicHttpPresent(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  return existsSync(join(here, 'public-http.ts'));
}

export function readmodelsDoneBarTestsPresent(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  return READMODELS_DONE_BAR_TEST_FILES.every((file) => existsSync(join(here, file)));
}

export function readmodelsChainUnavailableHonestInSource(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, 'chain', 'evm', 'availability.ts'), 'utf8');
  return /ChainUnavailableError/.test(src) && /indexer\.chain_unreachable/.test(src);
}

export function indexerReadmodelsTrackerBackendDoneBarMet(): boolean {
  return (
    readmodelsDoorsInRouterSource().length === READMODELS_MOUNTED_DOORS.length &&
    readmodelsPublicHttpPresent() &&
    readmodelsDoneBarTestsPresent() &&
    readmodelsChainUnavailableHonestInSource()
  );
}

export function indexerReadmodelsMountVsTrackerBoardCard(): {
  readonly tracker: typeof INDEXER_READMODELS_TRACKER_ID;
  readonly doors: number;
  readonly doorsMounted: number;
  readonly gaps: number;
  readonly backendDoneBarMet: boolean;
} {
  const mounted = readmodelsDoorsInRouterSource();
  return {
    tracker: INDEXER_READMODELS_TRACKER_ID,
    doors: READMODELS_MOUNTED_DOORS.length,
    doorsMounted: mounted.length,
    gaps: READMODELS_HONEST_GAPS.length,
    backendDoneBarMet: indexerReadmodelsTrackerBackendDoneBarMet(),
  };
}
