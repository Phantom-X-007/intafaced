/**
 * D26-P1-T7 — trade.forex mount vs tracker honest gaps.
 *
 * Refuse-closed settlement posture on public doors; P0-05 env pass-through.
 * Fiat settle rails remain Class X.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { forexOwnerEnvComposeGapsClosed as forexOwnerEnvComposeWired } from './forex-compose-wiring.js';
import { forexSettlementStatus } from './forex-settlement.js';

export const FOREX_TRACKER_ID = 'trade.forex' as const;

export const FOREX_MOUNTED_DOORS = ['settlementStatus', 'productStatus', 'assertProductionListing'] as const;

export const FOREX_DONE_BAR_TEST_FILES = [
  'forex-settlement.test.ts',
  'forex-settlement-public-doors.test.ts',
  'forex-compose-wiring.test.ts',
] as const;

/** P0-05 compose wired; fiat settle rails remain Class X. */
export const FOREX_HONEST_GAPS = ['gap.fiat_settle_rails'] as const;

export function forexDoorsInRouterSource(): readonly (typeof FOREX_MOUNTED_DOORS)[number][] {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '..', 'router.ts'), 'utf8');
  const start = src.search(/^\s{4}forex:\s*router\(\{/m);
  if (start === -1) return [];
  const next = src.slice(start + 1).search(/^\s{4}[a-zA-Z]+:\s*router\(\{/m);
  const block = next === -1 ? src.slice(start) : src.slice(start, start + 1 + next);
  return FOREX_MOUNTED_DOORS.filter((door) => new RegExp(`\\b${door}\\s*:`).test(block));
}

export function forexSettlementHonest(): boolean {
  const s = forexSettlementStatus();
  return s.published === false && s.allowed.productionActiveListing === false && s.allowed.productionPlace === false;
}

export function forexDoneBarTestsPresent(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  return FOREX_DONE_BAR_TEST_FILES.every((file) => existsSync(join(here, file)));
}

export function forexOwnerEnvComposeGapsClosed(): boolean {
  return forexOwnerEnvComposeWired();
}

export function forexTrackerBackendDoneBarMet(): boolean {
  return (
    forexDoorsInRouterSource().length === FOREX_MOUNTED_DOORS.length &&
    forexSettlementHonest() &&
    forexDoneBarTestsPresent() &&
    forexOwnerEnvComposeGapsClosed()
  );
}

export function forexMountVsTrackerBoardCard(): {
  readonly tracker: typeof FOREX_TRACKER_ID;
  readonly doors: number;
  readonly doorsMounted: number;
  readonly gaps: number;
  readonly backendDoneBarMet: boolean;
} {
  const mounted = forexDoorsInRouterSource();
  return {
    tracker: FOREX_TRACKER_ID,
    doors: FOREX_MOUNTED_DOORS.length,
    doorsMounted: mounted.length,
    gaps: FOREX_HONEST_GAPS.length,
    backendDoneBarMet: forexTrackerBackendDoneBarMet(),
  };
}
