/**
 * D26-P1-O4 — ops.kb-workflow mount vs tracker honest gaps.
 *
 * KB half product-complete: versioned i18n-keyed catalog + list/search/get doors.
 * User-defined workflow automation stays refused — agents.gateway owns agent runtime.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLATFORM_KB_SPINE, getKbById, publishedOnly, searchKb } from './kb-catalog.js';

export const OPS_KB_WORKFLOW_TRACKER_ID = 'ops.kb-workflow' as const;

export const KB_MOUNTED_DOORS = ['listKb', 'searchKb', 'getKb'] as const;

export type KbMountedDoor = (typeof KB_MOUNTED_DOORS)[number];

export const KB_HONEST_GAPS = [
  'gap.no_user_defined_workflow_engine',
  'gap.agents_gateway_owns_runtime',
  'gap.no_invent_sla_timings',
] as const;

export function kbDoorsInRouterSource(): readonly KbMountedDoor[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, 'router.ts'), 'utf8');
  return KB_MOUNTED_DOORS.filter((door) => new RegExp(`\\b${door}\\s*:`).test(src));
}

export function kbCatalogTestsPresent(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  return existsSync(join(here, 'kb-catalog.test.ts'));
}

export function kbCatalogHonest(): boolean {
  const spine = publishedOnly(PLATFORM_KB_SPINE);
  return (
    spine.length > 0 &&
    spine.every((a) => a.titleKey.startsWith('support.kb.') && a.bodyKey.startsWith('support.kb.')) &&
    searchKb('account', PLATFORM_KB_SPINE).length > 0 &&
    getKbById('kb-account-access', PLATFORM_KB_SPINE)?.id === 'kb-account-access'
  );
}

export function kbMountMatrixComplete(): boolean {
  return kbDoorsInRouterSource().length === KB_MOUNTED_DOORS.length;
}

export function opsKbWorkflowTrackerBackendDoneBarMet(): boolean {
  return kbMountMatrixComplete() && kbCatalogTestsPresent() && kbCatalogHonest();
}

export function opsKbWorkflowMountVsTrackerBoardCard(): {
  readonly tracker: typeof OPS_KB_WORKFLOW_TRACKER_ID;
  readonly doors: number;
  readonly doorsMounted: number;
  readonly gaps: number;
  readonly backendDoneBarMet: boolean;
} {
  const mounted = kbDoorsInRouterSource();
  return {
    tracker: OPS_KB_WORKFLOW_TRACKER_ID,
    doors: KB_MOUNTED_DOORS.length,
    doorsMounted: mounted.length,
    gaps: KB_HONEST_GAPS.length,
    backendDoneBarMet: opsKbWorkflowTrackerBackendDoneBarMet(),
  };
}
