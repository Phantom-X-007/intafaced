/**
 * D26-P1-T7 — trade.forex mount vs tracker honest gaps.
 *
 * Refuse-closed settlement posture on public doors until P0-05 + fiat rails.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FOREX_TRACKER_ID = 'trade.forex' as const;

export const FOREX_MOUNTED_DOORS = ['settlementStatus', 'assertProductionListing'] as const;

export const FOREX_DONE_BAR_TEST_FILES = ['forex-settlement-public-doors.test.ts', 'forex-settlement.test.ts'] as const;

export const FOREX_HONEST_GAPS = ['gap.fiat_settle_rails', 'gap.owner_settlement_asset_p0_05'] as const;

export function forexDoorsInRouterSource(): readonly (typeof FOREX_MOUNTED_DOORS)[number][] {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '..', 'router.ts'), 'utf8');
  const start = src.search(/^\s{4}forex:\s*router\(\{/m);
  if (start === -1) return [];
  const next = src.slice(start + 1).search(/^\s{4}[a-zA-Z]+:\s*router\(\{/m);
  const block = next === -1 ? src.slice(start) : src.slice(start, start + 1 + next);
  return FOREX_MOUNTED_DOORS.filter((door) => new RegExp(`\\b${door}\\s*:`).test(block));
}

export function forexSettlementHonestInSource(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, 'forex-settlement.ts'), 'utf8');
  return (
    /FOREX_SETTLEMENT_SOCKET/.test(src) &&
    /FOREX_SETTLEMENT_REFUSE_CODE/.test(src) &&
    /published:\s*false/.test(src) &&
    /productionPlace:\s*false/.test(src)
  );
}

export function forexDoneBarTestsPresent(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  return FOREX_DONE_BAR_TEST_FILES.every((file) => existsSync(join(here, file)));
}

export function forexTrackerBackendDoneBarMet(): boolean {
  return forexDoorsInRouterSource().length === FOREX_MOUNTED_DOORS.length && forexSettlementHonestInSource() && forexDoneBarTestsPresent();
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
