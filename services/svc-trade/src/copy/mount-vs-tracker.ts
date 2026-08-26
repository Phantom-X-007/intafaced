/**
 * D26-P1-T3 — trade.copy mount vs tracker honest gaps.
 *
 * Backend product-complete: sovereign desk shape, follow/kill/unfollow, fee-share refuse.
 * Live leader plane + auto-mirror Class X residuals stay honest gaps.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyOwnerLawComposeGapsClosed as copyOwnerLawComposeWired } from './copy-compose-wiring.js';
import { describeCopyPolicy } from './copy-policy.js';

export const COPY_TRACKER_ID = 'trade.copy' as const;

export const COPY_MOUNTED_DOORS = [
  'policy',
  'deskStatus',
  'follow',
  'unfollow',
  'killFeeShare',
  'pause',
  'stop',
  'detach',
  'resume',
] as const;

export type CopyMountedDoor = (typeof COPY_MOUNTED_DOORS)[number];

/** Fee-share + jurisdiction owner env wired in compose; auto-mirror socket + ranked board remain Class X. */
export const COPY_HONEST_GAPS = ['gap.auto_mirror_place_socket', 'gap.no_returns_ranked_board'] as const;

export function copyOwnerLawComposeGapsClosed(): boolean {
  return copyOwnerLawComposeWired();
}

export function copyDoorsInRouterSource(): readonly CopyMountedDoor[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const routerPath = join(here, '..', 'router.ts');
  const src = readFileSync(routerPath, 'utf8');
  const start = src.search(/^\s{4}copy:\s*router\(\{/m);
  if (start === -1) return [];
  const next = src.slice(start + 1).search(/^\s{4}[a-zA-Z]+:\s*router\(\{/m);
  const block = next === -1 ? src.slice(start) : src.slice(start, start + 1 + next);
  return COPY_MOUNTED_DOORS.filter((door) => new RegExp(`\\b${door}\\s*:`).test(block));
}

export function copyPolicyHonest(): boolean {
  const p = describeCopyPolicy();
  return p.sovereignShape === 'sovereign' && p.pnlFeeForbidden === true && p.rankingForbidden === true;
}

export function copyMountMatrixComplete(): boolean {
  return copyDoorsInRouterSource().length === COPY_MOUNTED_DOORS.length;
}

export function copyTrackerBackendDoneBarMet(): boolean {
  return copyMountMatrixComplete() && copyPolicyHonest();
}

export function copyMountVsTrackerBoardCard(): {
  readonly tracker: typeof COPY_TRACKER_ID;
  readonly doors: number;
  readonly doorsMounted: number;
  readonly gaps: number;
  readonly backendDoneBarMet: boolean;
  readonly mountComplete: boolean;
} {
  const mounted = copyDoorsInRouterSource();
  return {
    tracker: COPY_TRACKER_ID,
    doors: COPY_MOUNTED_DOORS.length,
    doorsMounted: mounted.length,
    gaps: COPY_HONEST_GAPS.length,
    backendDoneBarMet: copyTrackerBackendDoneBarMet(),
    mountComplete: mounted.length === COPY_MOUNTED_DOORS.length,
  };
}
