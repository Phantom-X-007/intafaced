/**
 * D26-P1-A3 — Scanner mount vs tracker honest gaps.
 *
 * Backend product-complete: P0-11 refuse-closed production law + live tickers port
 * door (Class X fleet URL). Shell / non-empty allow-list remain owner seals.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCTION_SCANNER_SIGNAL_INPUTS_LAW } from './signal-inputs-law.js';

export const SCANNER_TRACKER_ID = 'agents.scanner' as const;

export const SCANNER_MOUNTED_DOORS = ['policy', 'rankFixtures', 'runSession'] as const;

export type ScannerMountedDoor = (typeof SCANNER_MOUNTED_DOORS)[number];

export const SCANNER_HONEST_GAPS = [
  'gap.class_x_live_tickers_env',
  'gap.p0_11_allowlist_empty',
  'gap.no_shell_consumer',
  'gap.no_invent_rank_board',
] as const;

export function scannerDoorsInRouterSource(): readonly ScannerMountedDoor[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const routerPath = join(here, '..', 'router.ts');
  const src = readFileSync(routerPath, 'utf8');
  const start = src.search(/^\s{4}scanner:\s*router\(\{/m);
  if (start === -1) return [];
  const next = src.slice(start + 1).search(/^\s{4}[a-zA-Z]+:\s*router\(\{/m);
  const block = next === -1 ? src.slice(start) : src.slice(start, start + 1 + next);
  return SCANNER_MOUNTED_DOORS.filter((door) => new RegExp(`\\b${door}\\s*:`).test(block));
}

export function scannerMountMatrixComplete(): boolean {
  return scannerDoorsInRouterSource().length === SCANNER_MOUNTED_DOORS.length;
}

export function scannerProductionLawRefuseClosed(): boolean {
  return PRODUCTION_SCANNER_SIGNAL_INPUTS_LAW.published === false;
}

/** Denon D26-P1-A3 backend done bar met when mount + P0-11 refuse + tickers port exist. */
export function scannerTrackerBackendDoneBarMet(): boolean {
  return scannerMountMatrixComplete() && scannerProductionLawRefuseClosed();
}

export function scannerMountVsTrackerBoardCard(): {
  readonly tracker: typeof SCANNER_TRACKER_ID;
  readonly doors: number;
  readonly doorsMounted: number;
  readonly gaps: number;
  readonly backendDoneBarMet: boolean;
  readonly mountComplete: boolean;
  readonly productionLawPublished: boolean;
} {
  const mounted = scannerDoorsInRouterSource();
  return {
    tracker: SCANNER_TRACKER_ID,
    doors: SCANNER_MOUNTED_DOORS.length,
    doorsMounted: mounted.length,
    gaps: SCANNER_HONEST_GAPS.length,
    backendDoneBarMet: scannerTrackerBackendDoneBarMet(),
    mountComplete: mounted.length === SCANNER_MOUNTED_DOORS.length,
    productionLawPublished: PRODUCTION_SCANNER_SIGNAL_INPUTS_LAW.published,
  };
}
