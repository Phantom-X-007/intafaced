/**
 * D26-P1-T1 — trade.futures mount vs tracker honest gaps.
 *
 * Backend product-complete: isolated margin ladder, funding, ADL disclosure, gap-series marks.
 * Owner ladder numbers / funding rates / live re-leverage stay Class X residuals.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { futuresOwnerComposeGapsClosed } from './futures-compose-wiring.js';

export const FUTURES_TRACKER_ID = 'trade.futures' as const;

export const FUTURES_MOUNTED_DOORS = ['policy'] as const;

export const FUTURES_DONE_BAR_TEST_FILES = [
  'futures-policy.test.ts',
  'mark-gap-series-honesty.test.ts',
  'adl-disclosure.test.ts',
  'funding-settlement.test.ts',
  'futures-leverage-p0-07-default.test.ts',
  'futures-ladder-owner-gate.test.ts',
  'futures-compose-wiring.test.ts',
] as const;

/** Owner ladder/funding/leverage env + compose wired; live re-leverage socket remains Class X. */
export const FUTURES_HONEST_GAPS = ['gap.live_releverage_501'] as const;

export function futuresOwnerEnvComposeGapsClosed(): boolean {
  return futuresOwnerComposeGapsClosed();
}

export function futuresDoorsInRouterSource(): readonly (typeof FUTURES_MOUNTED_DOORS)[number][] {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '..', 'router.ts'), 'utf8');
  const start = src.search(/^\s{4}futures:\s*router\(\{/m);
  if (start === -1) return [];
  const next = src.slice(start + 1).search(/^\s{4}[a-zA-Z]+:\s*router\(\{/m);
  const block = next === -1 ? src.slice(start) : src.slice(start, start + 1 + next);
  return FUTURES_MOUNTED_DOORS.filter((door) => new RegExp(`\\b${door}\\s*:`).test(block));
}

export function futuresPolicyHonestInSource(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, 'futures-policy.ts'), 'utf8');
  return (
    /describeFuturesPolicy/.test(src) &&
    /insuranceEmptyBlocksLiveList/.test(src) &&
    /ADL_DISCLOSURE_REQUIRED/.test(src) &&
    /jobsDefault:\s*false/.test(src)
  );
}

export function futuresDoneBarTestsPresent(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  return FUTURES_DONE_BAR_TEST_FILES.every((file) => existsSync(join(here, file)));
}

export function futuresTrackerBackendDoneBarMet(): boolean {
  return (
    futuresDoorsInRouterSource().length === FUTURES_MOUNTED_DOORS.length && futuresPolicyHonestInSource() && futuresDoneBarTestsPresent()
  );
}

export function futuresMountVsTrackerBoardCard(): {
  readonly tracker: typeof FUTURES_TRACKER_ID;
  readonly doors: number;
  readonly doorsMounted: number;
  readonly gaps: number;
  readonly backendDoneBarMet: boolean;
} {
  const mounted = futuresDoorsInRouterSource();
  return {
    tracker: FUTURES_TRACKER_ID,
    doors: FUTURES_MOUNTED_DOORS.length,
    doorsMounted: mounted.length,
    gaps: FUTURES_HONEST_GAPS.length,
    backendDoneBarMet: futuresTrackerBackendDoneBarMet(),
  };
}
