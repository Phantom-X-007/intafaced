/**
 * D26-P1-O4M — ops.analytics mount vs tracker honest gaps.
 *
 * Warehouse read replica + lag honesty — never invent live cubes or writer URLs.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ANALYTICS_TRACKER_ID = 'ops.analytics' as const;

export const ANALYTICS_PRODUCT_SYMBOLS = [
  'resolveEtlWatermark',
  'queryWarehouseSurface',
  'assertAnalyticsReplicaRole',
  'mayPaintLiveCubes',
] as const;

export const ANALYTICS_DONE_BAR_TEST_FILES = [
  'ops-analytics-warehouse.test.ts',
  'ops-analytics.test.ts',
  'ops-analytics-mount-vs-tracker.test.ts',
] as const;

export const ANALYTICS_HONEST_GAPS = ['gap.cube_job_callers_phase_b', 'gap.never_second_balances'] as const;

export function analyticsSymbolsInWarehouseSource(): readonly (typeof ANALYTICS_PRODUCT_SYMBOLS)[number][] {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, 'ops-analytics-warehouse.ts'), 'utf8');
  return ANALYTICS_PRODUCT_SYMBOLS.filter((name) => new RegExp(`\\b${name}\\b`).test(src));
}

export function analyticsWarehouseHonestInSource(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  const warehouse = readFileSync(join(here, 'ops-analytics-warehouse.ts'), 'utf8');
  const analytics = readFileSync(join(here, 'ops-analytics.ts'), 'utf8');
  return (
    /FORBIDDEN_ANALYTICS_WRITER_USER_FRAGMENTS/.test(warehouse) && /never invent volume/i.test(warehouse) && /mayLabelLive/.test(analytics)
  );
}

export function analyticsEdgeHonestyReferenced(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  const edgePath = join(here, '..', '..', '..', 'services', 'svc-edge', 'src', 'compliance-honesty.ts');
  if (!existsSync(edgePath)) return false;
  const src = readFileSync(edgePath, 'utf8');
  return /queryWarehouseSurface/.test(src) && /resolveEtlWatermark/.test(src) && /warehouseSurfaceStatusLine/.test(src);
}

export function analyticsDoneBarTestsPresent(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  return ANALYTICS_DONE_BAR_TEST_FILES.every((file) => existsSync(join(here, file)));
}

export function opsAnalyticsTrackerBackendDoneBarMet(): boolean {
  return (
    analyticsSymbolsInWarehouseSource().length === ANALYTICS_PRODUCT_SYMBOLS.length &&
    analyticsWarehouseHonestInSource() &&
    analyticsEdgeHonestyReferenced() &&
    analyticsDoneBarTestsPresent()
  );
}

export function opsAnalyticsMountVsTrackerBoardCard(): {
  readonly tracker: typeof ANALYTICS_TRACKER_ID;
  readonly symbols: number;
  readonly symbolsPresent: number;
  readonly gaps: number;
  readonly backendDoneBarMet: boolean;
} {
  const present = analyticsSymbolsInWarehouseSource();
  return {
    tracker: ANALYTICS_TRACKER_ID,
    symbols: ANALYTICS_PRODUCT_SYMBOLS.length,
    symbolsPresent: present.length,
    gaps: ANALYTICS_HONEST_GAPS.length,
    backendDoneBarMet: opsAnalyticsTrackerBackendDoneBarMet(),
  };
}
