/**
 * D26-P1-F1 — infra.drop-flags mount vs tracker honest gaps.
 *
 * §11 drop-sequence switch: assertEnabled refuse + offReadiness tracker honesty.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DROP_FLAGS_TRACKER_ID = 'infra.drop-flags' as const;

export const DROP_FLAGS_PRODUCT_SYMBOLS = ['assertEnabled', 'FlagDisabledError', 'offReadiness', 'WAITLIST_REFERRAL_FLAGS'] as const;

export const DROP_FLAGS_DONE_BAR_TEST_FILES = ['flag-enforcement.test.ts', 'flags.test.ts'] as const;

export const DROP_FLAGS_HONEST_GAPS = ['gap.waitlist_referral_callers_partial', 'gap.founding_badge_mint_chain'] as const;

export function dropFlagsSymbolsInSource(): readonly (typeof DROP_FLAGS_PRODUCT_SYMBOLS)[number][] {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, 'flags.ts'), 'utf8');
  return DROP_FLAGS_PRODUCT_SYMBOLS.filter((name) => new RegExp(`\\b${name}\\b`).test(src));
}

export function dropFlagsMechanismHonestInSource(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, 'flags.ts'), 'utf8');
  return (
    /export function assertEnabled/.test(src) &&
    /export class FlagDisabledError/.test(src) &&
    /export function offReadiness/.test(src) &&
    /waitlist\.enabled/.test(src)
  );
}

export function dropFlagsDoneBarTestsPresent(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  return DROP_FLAGS_DONE_BAR_TEST_FILES.every((file) => existsSync(join(here, file)));
}

export function dropFlagsTrackerBackendDoneBarMet(): boolean {
  return (
    dropFlagsSymbolsInSource().length === DROP_FLAGS_PRODUCT_SYMBOLS.length &&
    dropFlagsMechanismHonestInSource() &&
    dropFlagsDoneBarTestsPresent()
  );
}

export function dropFlagsMountVsTrackerBoardCard(): {
  readonly tracker: typeof DROP_FLAGS_TRACKER_ID;
  readonly symbols: number;
  readonly symbolsPresent: number;
  readonly gaps: number;
  readonly backendDoneBarMet: boolean;
} {
  const present = dropFlagsSymbolsInSource();
  return {
    tracker: DROP_FLAGS_TRACKER_ID,
    symbols: DROP_FLAGS_PRODUCT_SYMBOLS.length,
    symbolsPresent: present.length,
    gaps: DROP_FLAGS_HONEST_GAPS.length,
    backendDoneBarMet: dropFlagsTrackerBackendDoneBarMet(),
  };
}
