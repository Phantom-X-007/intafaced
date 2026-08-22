/**
 * D26-P1-T2 — trade.otc mount vs tracker honest gaps.
 *
 * Backend product-complete: RFQ → stake gate → fail-closed quote → ledger settle,
 * durable quotes, venue mid feed. Owner desk-law numbers + maker routing socket Class X.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describeOtcPolicy } from './otc-policy.js';

export const OTC_TRACKER_ID = 'trade.otc' as const;

export const OTC_MOUNTED_DOORS = ['policy', 'deskStatus', 'quote', 'accept', 'settle'] as const;

export type OtcMountedDoor = (typeof OTC_MOUNTED_DOORS)[number];

export const OTC_DONE_BAR_TEST_FILES = [
  'otc-rfq-settle-donebar.test.ts',
  'otc-mount.reachable.test.ts',
  'otc-maker-routing-donebar.test.ts',
  'otc-mid-feed-donebar.test.ts',
] as const;

export const OTC_HONEST_GAPS = ['gap.owner_desk_law_numbers', 'gap.socket_otc_maker_routing', 'gap.connect_venue_vault_custody'] as const;

export function otcDoorsInRouterSource(): readonly OtcMountedDoor[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const routerPath = join(here, '..', 'router.ts');
  const src = readFileSync(routerPath, 'utf8');
  const start = src.search(/^\s{4}otc:\s*router\(\{/m);
  if (start === -1) return [];
  const next = src.slice(start + 1).search(/^\s{4}[a-zA-Z]+:\s*router\(\{/m);
  const block = next === -1 ? src.slice(start) : src.slice(start, start + 1 + next);
  return OTC_MOUNTED_DOORS.filter((door) => new RegExp(`\\b${door}\\s*:`).test(block));
}

export function otcDoneBarTestsPresent(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  return OTC_DONE_BAR_TEST_FILES.every((file) => existsSync(join(here, file)));
}

export function otcPolicyHonest(): boolean {
  const p = describeOtcPolicy();
  return (
    p.inventsSpreadBps === false &&
    p.inventsStakeGate === false &&
    p.inventsMakerBook === false &&
    p.inventsMidPrice === false &&
    p.midFeedWiringHonest === true &&
    p.midFeedWiringStates.length === 4 &&
    p.bootMidFeedWiring.wiring === 'flag_off' &&
    p.moneyViaLedgerClientOnly === true
  );
}

export function otcMountMatrixComplete(): boolean {
  return otcDoorsInRouterSource().length === OTC_MOUNTED_DOORS.length;
}

export function otcTrackerBackendDoneBarMet(): boolean {
  return otcMountMatrixComplete() && otcDoneBarTestsPresent() && otcPolicyHonest();
}

export function otcMountVsTrackerBoardCard(): {
  readonly tracker: typeof OTC_TRACKER_ID;
  readonly doors: number;
  readonly doorsMounted: number;
  readonly gaps: number;
  readonly backendDoneBarMet: boolean;
  readonly mountComplete: boolean;
} {
  const mounted = otcDoorsInRouterSource();
  return {
    tracker: OTC_TRACKER_ID,
    doors: OTC_MOUNTED_DOORS.length,
    doorsMounted: mounted.length,
    gaps: OTC_HONEST_GAPS.length,
    backendDoneBarMet: otcTrackerBackendDoneBarMet(),
    mountComplete: mounted.length === OTC_MOUNTED_DOORS.length,
  };
}
