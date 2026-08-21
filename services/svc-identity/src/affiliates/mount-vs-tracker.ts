/**
 * D26-P1-O2 — ops.affiliates mount vs tracker honest gaps.
 *
 * Backend product-complete: accrual tree under rate authority; payout via ledger-client;
 * S2S producer doors for pay/trade fee events. Vue admin is Class X residual.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const AFFILIATES_TRACKER_ID = 'ops.affiliates' as const;

export const AFFILIATES_BLOCKER_TRACKER_ID = 'ledger.double-entry' as const;

export const AFFILIATES_MOUNTED_DOORS = ['policy', 'accrue', 'accrueDryRun', 'treeStatus', 'payout'] as const;

export type AffiliatesMountedDoor = (typeof AFFILIATES_MOUNTED_DOORS)[number];

export const AFFILIATES_HONEST_GAPS = ['gap.vue_admin_desk', 'gap.no_shell_consumer'] as const;

export function affiliatesDoorsInRouterSource(): readonly AffiliatesMountedDoor[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const routerPath = join(here, '..', 'router.ts');
  const src = readFileSync(routerPath, 'utf8');
  const start = src.search(/^\s{4}affiliates:\s*router\(\{/m);
  if (start === -1) return [];
  const next = src.slice(start + 1).search(/^\s{4}[a-zA-Z]+:\s*router\(\{/m);
  const block = next === -1 ? src.slice(start) : src.slice(start, start + 1 + next);
  return AFFILIATES_MOUNTED_DOORS.filter((door) => new RegExp(`\\b${door}\\s*:`).test(block));
}

export function affiliatesProducerDoorsInIndexSource(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  const indexPath = join(here, '..', 'index.ts');
  const producerPath = join(here, 'producer-accrue.ts');
  const indexSrc = readFileSync(indexPath, 'utf8');
  const producerSrc = readFileSync(producerPath, 'utf8');
  return (
    /registerAffiliateProducerAccrue\s*\(/.test(indexSrc) &&
    /registerAffiliateProducerPayout\s*\(/.test(indexSrc) &&
    /AFFILIATE_PRODUCER_PATH\s*=/.test(producerSrc)
  );
}

export function affiliatesMountMatrixComplete(): boolean {
  return affiliatesDoorsInRouterSource().length === AFFILIATES_MOUNTED_DOORS.length;
}

/** Denon D26-P1-O2 backend done bar met when accrual + payout + producer doors wired. */
export function affiliatesTrackerBackendDoneBarMet(): boolean {
  return affiliatesMountMatrixComplete() && affiliatesProducerDoorsInIndexSource();
}

export function affiliatesMountVsTrackerBoardCard(): {
  readonly tracker: typeof AFFILIATES_TRACKER_ID;
  readonly blocker: typeof AFFILIATES_BLOCKER_TRACKER_ID;
  readonly doors: number;
  readonly doorsMounted: number;
  readonly gaps: number;
  readonly backendDoneBarMet: boolean;
  readonly mountComplete: boolean;
} {
  const mounted = affiliatesDoorsInRouterSource();
  return {
    tracker: AFFILIATES_TRACKER_ID,
    blocker: AFFILIATES_BLOCKER_TRACKER_ID,
    doors: AFFILIATES_MOUNTED_DOORS.length,
    doorsMounted: mounted.length,
    gaps: AFFILIATES_HONEST_GAPS.length,
    backendDoneBarMet: affiliatesTrackerBackendDoneBarMet(),
    mountComplete: mounted.length === AFFILIATES_MOUNTED_DOORS.length,
  };
}
