/**
 * D26-P1-X5 — execution.market-making mount vs tracker honest gaps.
 *
 * Backend product-complete: external-only MM half on SOR cost model.
 * Internal venue MM blocked until owner ruling; spread/skew bands wired via owner env.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mmSpreadSkewBandsComposeWired } from './mm-compose-wiring.js';

export const EXECUTION_MM_TRACKER_ID = 'execution.market-making' as const;

export const EXECUTION_MM_BLOCKER_TRACKER_ID = 'execution.sor' as const;

export const MM_PRODUCT_EXPORTS = [
  'quoteExternalMm',
  'planExternalMmHedge',
  'evaluateMmKillSwitches',
  'describeMarketMakingPolicy',
] as const;

export type MmProductExport = (typeof MM_PRODUCT_EXPORTS)[number];

export const MM_HONEST_GAPS = ['gap.internal_venue_mm_blocked'] as const;

export const MM_DONE_BAR_TEST_FILES = ['market-making.test.ts', 'mm-spread-skew-bands.test.ts', 'mm-compose-wiring.test.ts'] as const;

export function mmSpreadSkewBandsGapsClosed(): boolean {
  return mmSpreadSkewBandsComposeWired();
}

export function mmExportsInIndexSource(): readonly MmProductExport[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, 'index.ts'), 'utf8');
  return MM_PRODUCT_EXPORTS.filter((name) => new RegExp(`\\b${name}\\b`).test(src));
}

export function mmDoneBarTestPresent(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  return MM_DONE_BAR_TEST_FILES.every((file) => existsSync(join(here, file)));
}

export function executionMmTrackerBackendDoneBarMet(): boolean {
  return mmExportsInIndexSource().length === MM_PRODUCT_EXPORTS.length && mmDoneBarTestPresent();
}

export function executionMmMountVsTrackerBoardCard(): {
  readonly tracker: typeof EXECUTION_MM_TRACKER_ID;
  readonly blocker: typeof EXECUTION_MM_BLOCKER_TRACKER_ID;
  readonly exports: number;
  readonly exportsPresent: number;
  readonly gaps: number;
  readonly backendDoneBarMet: boolean;
} {
  const present = mmExportsInIndexSource();
  return {
    tracker: EXECUTION_MM_TRACKER_ID,
    blocker: EXECUTION_MM_BLOCKER_TRACKER_ID,
    exports: MM_PRODUCT_EXPORTS.length,
    exportsPresent: present.length,
    gaps: MM_HONEST_GAPS.length,
    backendDoneBarMet: executionMmTrackerBackendDoneBarMet(),
  };
}
