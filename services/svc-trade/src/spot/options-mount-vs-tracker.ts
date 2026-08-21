/**
 * D26-P1-T6 — trade.options mount vs tracker honest gaps.
 *
 * Settlement law refuse-closed on policy door; no invented live set or IV surface.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const OPTIONS_TRACKER_ID = 'trade.options' as const;

export const OPTIONS_MOUNTED_DOORS = ['policy'] as const;

export const OPTIONS_DONE_BAR_TEST_FILES = ['options-policy.test.ts', 'options-listing.test.ts'] as const;

export const OPTIONS_HONEST_GAPS = [
  'gap.owner_settlement_asset_p0_05',
  'gap.d7_fixing_unconfigured',
  'gap.complete_european_terms',
] as const;

export function optionsDoorsInRouterSource(): readonly (typeof OPTIONS_MOUNTED_DOORS)[number][] {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '..', 'router.ts'), 'utf8');
  const start = src.search(/^\s{4}options:\s*router\(\{/m);
  if (start === -1) return [];
  const next = src.slice(start + 1).search(/^\s{4}[a-zA-Z]+:\s*router\(\{/m);
  const block = next === -1 ? src.slice(start) : src.slice(start, start + 1 + next);
  return OPTIONS_MOUNTED_DOORS.filter((door) => new RegExp(`\\b${door}\\s*:`).test(block));
}

export function optionsPolicyHonestInSource(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, 'options-policy.ts'), 'utf8');
  return (
    /describeOptionsPolicy/.test(src) &&
    /OPTIONS_SETTLEMENT_LAW_UNSET/.test(src) &&
    /inventsLiveSet:\s*false/.test(src) &&
    /inventsSettlementAsset:\s*false/.test(src)
  );
}

export function optionsDoneBarTestsPresent(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  return OPTIONS_DONE_BAR_TEST_FILES.every((file) => existsSync(join(here, file)));
}

export function optionsTrackerBackendDoneBarMet(): boolean {
  return (
    optionsDoorsInRouterSource().length === OPTIONS_MOUNTED_DOORS.length && optionsPolicyHonestInSource() && optionsDoneBarTestsPresent()
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
