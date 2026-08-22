/**
 * D26-P1-T4 — trade.options mount vs tracker honest gaps.
 *
 * Settlement law + D7 fixing env pass-through; European options engine Class X.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { optionsOwnerEnvComposeGapsClosed as optionsOwnerEnvComposeWired } from './options-compose-wiring.js';
import { describeOptionsPolicy } from './options-policy.js';

export const OPTIONS_TRACKER_ID = 'trade.options' as const;

export const OPTIONS_MOUNTED_DOORS = ['policy'] as const;

export const OPTIONS_DONE_BAR_TEST_FILES = [
  'options-policy.test.ts',
  'options-listing.test.ts',
  'options-compose-wiring.test.ts',
  'options-settlement-owner-gate.test.ts',
] as const;

/** P0-05 + D7 compose wired; European engine + order path remain Class X. */
export const OPTIONS_HONEST_GAPS = ['gap.european_options_engine'] as const;

export function optionsDoorsInRouterSource(): readonly (typeof OPTIONS_MOUNTED_DOORS)[number][] {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '..', 'router.ts'), 'utf8');
  const start = src.search(/^\s{4}options:\s*router\(\{/m);
  if (start === -1) return [];
  const next = src.slice(start + 1).search(/^\s{4}[a-zA-Z]+:\s*router\(\{/m);
  const block = next === -1 ? src.slice(start) : src.slice(start, start + 1 + next);
  return OPTIONS_MOUNTED_DOORS.filter((door) => new RegExp(`\\b${door}\\s*:`).test(block));
}

export function optionsPolicyHonest(): boolean {
  const p = describeOptionsPolicy();
  return (
    p.inventsLiveSet === false &&
    p.inventsSettlementAsset === false &&
    p.inventsIvSurface === false &&
    p.ordersStillRefuseUntilEngine === true &&
    p.europeanOnly === true
  );
}

export function optionsDoneBarTestsPresent(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  return OPTIONS_DONE_BAR_TEST_FILES.every((file) => existsSync(join(here, file)));
}

export function optionsOwnerEnvComposeGapsClosed(): boolean {
  return optionsOwnerEnvComposeWired();
}

export function optionsTrackerBackendDoneBarMet(): boolean {
  return (
    optionsDoorsInRouterSource().length === OPTIONS_MOUNTED_DOORS.length &&
    optionsPolicyHonest() &&
    optionsDoneBarTestsPresent() &&
    optionsOwnerEnvComposeGapsClosed()
  );
}

export function optionsMountVsTrackerBoardCard(): {
  readonly tracker: typeof OPTIONS_TRACKER_ID;
  readonly doors: number;
  readonly doorsMounted: number;
  readonly gaps: number;
  readonly backendDoneBarMet: boolean;
} {
  const mounted = optionsDoorsInRouterSource();
  return {
    tracker: OPTIONS_TRACKER_ID,
    doors: OPTIONS_MOUNTED_DOORS.length,
    doorsMounted: mounted.length,
    gaps: OPTIONS_HONEST_GAPS.length,
    backendDoneBarMet: optionsTrackerBackendDoneBarMet(),
  };
}
