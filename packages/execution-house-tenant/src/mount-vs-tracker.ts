/**
 * D26-P0-01 — execution.house-tenant mount vs tracker honest gaps.
 *
 * Stage-1 external-only sealed tenant mechanism on svc-execution.
 * Internal-venue half + existence disclosure remain Class X residuals.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describeHouseTenantPolicy } from './house-tenant-policy.js';

export const HOUSE_TENANT_TRACKER_ID = 'execution.house-tenant' as const;

export const HOUSE_TENANT_TENANT_DOORS = ['describe', 'kill'] as const;

export const HOUSE_TENANT_POLICY_DOOR = 'policy' as const;

export const HOUSE_TENANT_PACKAGE_EXPORTS = [
  'SealedHouseTenantRegistry',
  'authorizeTenantVenue',
  'describeHouseTenantPolicy',
  'evaluateHouseTenantPolicyGate',
  'isolateHouseVsTenant',
  'houseFillLook',
  'requireTenantId',
] as const;

export const HOUSE_TENANT_DONE_BAR_TEST_FILES = [
  'house-tenant.test.ts',
  'house-tenant-policy.test.ts',
  'house-vs-tenant.test.ts',
  'mount-vs-tracker.test.ts',
] as const;

export const HOUSE_TENANT_HONEST_GAPS = ['gap.internal_venue_half', 'gap.existence_disclosure_deferred'] as const;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export function houseTenantDoorsInExecutionRouter(): readonly (typeof HOUSE_TENANT_TENANT_DOORS)[number][] {
  const routerPath = join(ROOT, 'services/svc-execution/src/router.ts');
  const src = readFileSync(routerPath, 'utf8');
  const start = src.search(/^\s{6}tenant:\s*router\(\{/m);
  if (start === -1) return [];
  const next = src.slice(start + 1).search(/^\s{6}[a-zA-Z]+:\s*router\(\{/m);
  const block = next === -1 ? src.slice(start) : src.slice(start, start + 1 + next);
  return HOUSE_TENANT_TENANT_DOORS.filter((door) => new RegExp(`\\b${door}\\s*:`).test(block));
}

export function houseTenantPolicyDoorInExecutionRouter(): boolean {
  const routerPath = join(ROOT, 'services/svc-execution/src/router.ts');
  const src = readFileSync(routerPath, 'utf8');
  return new RegExp(`\\b${HOUSE_TENANT_POLICY_DOOR}\\s*:\\s*publicProcedure`).test(src);
}

export function houseTenantExportsInIndexSource(): readonly (typeof HOUSE_TENANT_PACKAGE_EXPORTS)[number][] {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, 'index.ts'), 'utf8');
  return HOUSE_TENANT_PACKAGE_EXPORTS.filter((name) => new RegExp(`\\b${name}\\b`).test(src));
}

export function houseTenantPolicyHonest(): boolean {
  const p = describeHouseTenantPolicy();
  return (
    p.externalOnlyV1 === true &&
    p.killSwitchAppliesFirst === true &&
    p.internalVenueBlocked === true &&
    p.matchingBookBlocked === true &&
    p.inventsVenueList === false &&
    p.inventsInternalTradingPath === false &&
    p.existenceDisclosureDeferred === true &&
    p.houseMaySpendTenantMoney === false &&
    p.houseFillMayLookLikeTenant === false &&
    p.missingTenantIdRefuses === true
  );
}

export function houseTenantDoneBarTestsPresent(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  return HOUSE_TENANT_DONE_BAR_TEST_FILES.every((file) => existsSync(join(here, file)));
}

export function houseTenantExecutionPolicyRouteTestPresent(): boolean {
  return existsSync(join(ROOT, 'services/svc-execution/src/execution-policy-route.test.ts'));
}

export function houseTenantTrackerBackendDoneBarMet(): boolean {
  return (
    houseTenantDoorsInExecutionRouter().length === HOUSE_TENANT_TENANT_DOORS.length &&
    houseTenantPolicyDoorInExecutionRouter() &&
    houseTenantExportsInIndexSource().length === HOUSE_TENANT_PACKAGE_EXPORTS.length &&
    houseTenantPolicyHonest() &&
    houseTenantDoneBarTestsPresent() &&
    houseTenantExecutionPolicyRouteTestPresent()
  );
}

export function houseTenantMountVsTrackerBoardCard(): {
  readonly tracker: typeof HOUSE_TENANT_TRACKER_ID;
  readonly doors: number;
  readonly doorsMounted: number;
  readonly gaps: number;
  readonly backendDoneBarMet: boolean;
} {
  const mounted = houseTenantDoorsInExecutionRouter();
  return {
    tracker: HOUSE_TENANT_TRACKER_ID,
    doors: HOUSE_TENANT_TENANT_DOORS.length,
    doorsMounted: mounted.length,
    gaps: HOUSE_TENANT_HONEST_GAPS.length,
    backendDoneBarMet: houseTenantTrackerBackendDoneBarMet(),
  };
}
