/**
 * D26-P0-01 — execution.house-tenant mount vs tracker honest gaps.
 *
 * Stage-1 external-only tenant + kill-first; internal/matching-book refuse.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HOUSE_TENANT_TRACKER_ID = 'execution.house-tenant' as const;

export const TENANT_MOUNTED_DOORS = ['describe', 'kill'] as const;

export const TENANT_DONE_BAR_TEST_FILES = ['house-tenant-policy.test.ts', 'house-tenant.test.ts'] as const;

export const TENANT_HONEST_GAPS = [
  'gap.internal_venue_blocked_v1',
  'gap.existence_disclosure_deferred',
  'gap.depends_on_sor_residual',
] as const;

export function tenantDoorsInExecutionRouterSource(): readonly (typeof TENANT_MOUNTED_DOORS)[number][] {
  const routerPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'services', 'svc-execution', 'src', 'router.ts');
  const src = readFileSync(routerPath, 'utf8');
  const start = src.search(/^\s{6}tenant:\s*router\(\{/m);
  if (start === -1) return [];
  const next = src.slice(start + 1).search(/^\s{6}[a-zA-Z]+:\s*router\(\{/m);
  const block = next === -1 ? src.slice(start) : src.slice(start, start + 1 + next);
  return TENANT_MOUNTED_DOORS.filter((door) => new RegExp(`\\b${door}\\s*:`).test(block));
}

export function houseTenantPolicyHonestInSource(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, 'house-tenant-policy.ts'), 'utf8');
  return (
    /describeHouseTenantPolicy/.test(src) &&
    /externalOnlyV1:\s*true/.test(src) &&
    /internalVenueBlocked:\s*true/.test(src) &&
    /inventsInternalTradingPath:\s*false/.test(src)
  );
}

export function houseTenantDoneBarTestsPresent(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  return TENANT_DONE_BAR_TEST_FILES.every((file) => existsSync(join(here, file)));
}

export function executionPolicyRouteTestPresent(): boolean {
  const path = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    '..',
    'services',
    'svc-execution',
    'src',
    'execution-policy-route.test.ts',
  );
  return existsSync(path);
}

export function houseTenantTrackerBackendDoneBarMet(): boolean {
  return (
    tenantDoorsInExecutionRouterSource().length === TENANT_MOUNTED_DOORS.length &&
    houseTenantPolicyHonestInSource() &&
    houseTenantDoneBarTestsPresent() &&
    executionPolicyRouteTestPresent()
  );
}

export function houseTenantMountVsTrackerBoardCard(): {
  readonly tracker: typeof HOUSE_TENANT_TRACKER_ID;
  readonly doors: number;
  readonly doorsMounted: number;
  readonly gaps: number;
  readonly backendDoneBarMet: boolean;
} {
  const mounted = tenantDoorsInExecutionRouterSource();
  return {
    tracker: HOUSE_TENANT_TRACKER_ID,
    doors: TENANT_MOUNTED_DOORS.length,
    doorsMounted: mounted.length,
    gaps: TENANT_HONEST_GAPS.length,
    backendDoneBarMet: houseTenantTrackerBackendDoneBarMet(),
  };
}
