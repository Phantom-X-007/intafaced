/**
 * D26-P1-A1 — v22.alerts mount vs tracker honest gaps.
 *
 * Price / funding / liquidation-proximity / whale watches + sweep driver mounted.
 * Intelligence kind + mobile sync + gateway creds remain Class X.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describeAlertsPolicy } from './alerts-policy.js';

export const ALERTS_TRACKER_ID = 'v22.alerts' as const;

export const ALERTS_MOUNTED_DOORS = ['alertsPolicy', 'alerts', 'createAlert', 'cancelAlert', 'evaluateAlert'] as const;

export const ALERTS_DONE_BAR_TEST_FILES = [
  'alerts/evaluate.test.ts',
  'alerts/sweep-mounted-pin.test.ts',
  'alerts-mount-vs-tracker.test.ts',
] as const;

export const ALERTS_HONEST_GAPS = ['gap.intelligence_kind', 'gap.mobile_sync', 'gap.out_of_app_gateway_credentials'] as const;

export function alertsDoorsInRouterSource(): readonly (typeof ALERTS_MOUNTED_DOORS)[number][] {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, 'router.ts'), 'utf8');
  const start = src.search(/^\s{4}notify:\s*router\(\{/m);
  if (start === -1) return [];
  const next = src.slice(start + 1).search(/^\s{4}[a-zA-Z]+:\s*router\(\{/m);
  const block = next === -1 ? src.slice(start) : src.slice(start, start + 1 + next);
  return ALERTS_MOUNTED_DOORS.filter((door) => new RegExp(`\\b${door}\\s*:`).test(block));
}

export function alertsPolicyHonest(): boolean {
  const p = describeAlertsPolicy();
  return (
    p.sourcedSeriesOnly === true &&
    p.publishedKinds.includes('funding') &&
    p.publishedKinds.includes('liquidation_proximity') &&
    p.publishedKinds.includes('whale') &&
    p.unpublishedKinds.length === 1 &&
    p.unpublishedKinds.includes('intelligence') &&
    p.darkMarkRefusesFire === true &&
    p.inventsPrices === false &&
    p.inventsPortfolioBalance === false &&
    p.sweepEvaluatesDueAlerts === true &&
    p.ridesNotifyFanout === true
  );
}

export function alertsDoneBarTestsPresent(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  return ALERTS_DONE_BAR_TEST_FILES.every((file) => existsSync(join(here, file)));
}

export function alertsSweepMountedInIndex(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  const index = readFileSync(join(here, 'index.ts'), 'utf8');
  return /runAlertSweepPass\(/.test(index) && /ALERT_SWEEP_INTERVAL_MS/.test(index);
}

export function alertsTrackerBackendDoneBarMet(): boolean {
  return (
    alertsDoorsInRouterSource().length === ALERTS_MOUNTED_DOORS.length &&
    alertsPolicyHonest() &&
    alertsDoneBarTestsPresent() &&
    alertsSweepMountedInIndex()
  );
}

export function alertsMountVsTrackerBoardCard(): {
  readonly tracker: typeof ALERTS_TRACKER_ID;
  readonly doors: number;
  readonly doorsMounted: number;
  readonly gaps: number;
  readonly backendDoneBarMet: boolean;
} {
  const mounted = alertsDoorsInRouterSource();
  return {
    tracker: ALERTS_TRACKER_ID,
    doors: ALERTS_MOUNTED_DOORS.length,
    doorsMounted: mounted.length,
    gaps: ALERTS_HONEST_GAPS.length,
    backendDoneBarMet: alertsTrackerBackendDoneBarMet(),
  };
}
