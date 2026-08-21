/**
 * D26-P1-A1 — v22.alerts mount vs tracker honest gaps.
 *
 * Price watch core + sweep driver mounted; dark mark refuses fire.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const V22_ALERTS_TRACKER_ID = 'v22.alerts' as const;

export const ALERTS_MOUNTED_DOORS = ['alertsPolicy', 'alerts', 'createAlert', 'cancelAlert', 'evaluateAlert'] as const;

export const ALERTS_DONE_BAR_TEST_FILES = [
  'alerts-policy.test.ts',
  'alerts/sweep-mounted-pin.test.ts',
  'alerts/evaluate.test.ts',
  'alerts/service.test.ts',
] as const;

export const ALERTS_HONEST_GAPS = [
  'gap.funding_liquidation_kinds_unpublished',
  'gap.whale_flow_scanner_tier',
  'gap.mobile_watchlist_sync',
  'gap.out_of_app_gateway_credentials',
] as const;

export function alertsDoorsInRouterSource(): readonly (typeof ALERTS_MOUNTED_DOORS)[number][] {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, 'router.ts'), 'utf8');
  const start = src.search(/^\s{4}notify:\s*router\(\{/m);
  if (start === -1) return [];
  const next = src.slice(start + 1).search(/^\s{4}[a-zA-Z]+:\s*router\(\{/m);
  const block = next === -1 ? src.slice(start) : src.slice(start, start + 1 + next);
  return ALERTS_MOUNTED_DOORS.filter((door) => new RegExp(`\\b${door}\\s*:`).test(block));
}

export function alertsPolicyHonestInSource(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, 'alerts-policy.ts'), 'utf8');
  return (
    /describeAlertsPolicy/.test(src) &&
    /priceWatchCoreOnly:\s*true/.test(src) &&
    /darkMarkRefusesFire:\s*true/.test(src) &&
    /inventsPrices:\s*false/.test(src)
  );
}

export function alertsDoneBarTestsPresent(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  return ALERTS_DONE_BAR_TEST_FILES.every((file) => existsSync(join(here, file)));
}

export function alertSweepMountedInIndex(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, 'index.ts'), 'utf8');
  return /runAlertSweepPass\(/.test(src) && /setInterval\([\s\S]*runAlertSweepPass/.test(src) && /alertSweep/.test(src);
}

export function v22AlertsTrackerBackendDoneBarMet(): boolean {
  return (
    alertsDoorsInRouterSource().length === ALERTS_MOUNTED_DOORS.length &&
    alertsPolicyHonestInSource() &&
    alertsDoneBarTestsPresent() &&
    alertSweepMountedInIndex()
  );
}

export function v22AlertsMountVsTrackerBoardCard(): {
  readonly tracker: typeof V22_ALERTS_TRACKER_ID;
  readonly doors: number;
  readonly doorsMounted: number;
  readonly gaps: number;
  readonly backendDoneBarMet: boolean;
} {
  const mounted = alertsDoorsInRouterSource();
  return {
    tracker: V22_ALERTS_TRACKER_ID,
    doors: ALERTS_MOUNTED_DOORS.length,
    doorsMounted: mounted.length,
    gaps: ALERTS_HONEST_GAPS.length,
    backendDoneBarMet: v22AlertsTrackerBackendDoneBarMet(),
  };
}
