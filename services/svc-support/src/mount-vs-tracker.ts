/**
 * D26-P1-O3 — ops.support mount vs tracker honest gaps.
 *
 * Backend product-complete: ticket spine, KB search/get, audit trail,
 * identity account-state grounding. Live compose observation is Class X env.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deskVsAgentSplit } from './desk-vs-agent-split.js';

export const OPS_SUPPORT_TRACKER_ID = 'ops.support' as const;

export const OPS_SUPPORT_MOUNTED_DOORS = ['create', 'searchKb', 'getKb', 'accountState', 'events'] as const;

export type OpsSupportMountedDoor = (typeof OPS_SUPPORT_MOUNTED_DOORS)[number];

export const OPS_SUPPORT_HONEST_GAPS = ['gap.class_x_live_compose_observation', 'gap.vue_admin_desk', 'gap.no_invent_sla'] as const;

export function opsSupportDoorsInRouterSource(): readonly OpsSupportMountedDoor[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const routerPath = join(here, 'router.ts');
  const src = readFileSync(routerPath, 'utf8');
  return OPS_SUPPORT_MOUNTED_DOORS.filter((door) => new RegExp(`\\b${door}\\s*:`).test(src));
}

export function opsSupportMountMatrixComplete(): boolean {
  return opsSupportDoorsInRouterSource().length === OPS_SUPPORT_MOUNTED_DOORS.length;
}

export function opsSupportDeskSplitHonest(): boolean {
  const split = deskVsAgentSplit();
  return split.deskStandalone === true && split.deskMountain === OPS_SUPPORT_TRACKER_ID;
}

/** Denon desk backend done bar met when core ticket+KB+audit doors are mounted. */
export function opsSupportTrackerBackendDoneBarMet(): boolean {
  return opsSupportMountMatrixComplete() && opsSupportDeskSplitHonest();
}

export function opsSupportMountVsTrackerBoardCard(): {
  readonly tracker: typeof OPS_SUPPORT_TRACKER_ID;
  readonly doors: number;
  readonly doorsMounted: number;
  readonly gaps: number;
  readonly backendDoneBarMet: boolean;
  readonly mountComplete: boolean;
} {
  const mounted = opsSupportDoorsInRouterSource();
  return {
    tracker: OPS_SUPPORT_TRACKER_ID,
    doors: OPS_SUPPORT_MOUNTED_DOORS.length,
    doorsMounted: mounted.length,
    gaps: OPS_SUPPORT_HONEST_GAPS.length,
    backendDoneBarMet: opsSupportTrackerBackendDoneBarMet(),
    mountComplete: mounted.length === OPS_SUPPORT_MOUNTED_DOORS.length,
  };
}
