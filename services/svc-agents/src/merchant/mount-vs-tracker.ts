/**
 * D26-P1-A4 — Merchant mount vs tracker honest gaps.
 *
 * Backend product-complete: approval-rate watch refuses missing/dark/stale metrics;
 * never invents numeric rates. Live PayMetricsPort wired when PAY_URL set (Class X).
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { merchantAgentGuardrail } from './guardrail.js';

export const MERCHANT_TRACKER_ID = 'agents.merchant' as const;

export const MERCHANT_BLOCKER_TRACKER_ID = 'pay.routing' as const;

export const MERCHANT_MOUNTED_DOORS = ['policy', 'watch', 'runSession'] as const;

export type MerchantMountedDoor = (typeof MERCHANT_MOUNTED_DOORS)[number];

export const MERCHANT_HONEST_GAPS = [
  'gap.class_x_live_pay_metrics_env',
  'gap.pay_routing_product_law_m1',
  'gap.no_shell_consumer',
] as const;

export function merchantDoorsInRouterSource(): readonly MerchantMountedDoor[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const routerPath = join(here, '..', 'router.ts');
  const src = readFileSync(routerPath, 'utf8');
  const start = src.search(/^\s{4}merchant:\s*router\(\{/m);
  if (start === -1) return [];
  const next = src.slice(start + 1).search(/^\s{4}[a-zA-Z]+:\s*router\(\{/m);
  const block = next === -1 ? src.slice(start) : src.slice(start, start + 1 + next);
  return MERCHANT_MOUNTED_DOORS.filter((door) => new RegExp(`\\b${door}\\s*:`).test(block));
}

export function merchantMountMatrixComplete(): boolean {
  return merchantDoorsInRouterSource().length === MERCHANT_MOUNTED_DOORS.length;
}

export function merchantDeclaredTaskMatchesGuardrail(): boolean {
  const tasks = merchantAgentGuardrail().limits.allowedTasks;
  return tasks.length === 1 && tasks[0] === 'merchant.watch';
}

/** Denon D26-P1-A4 backend done bar met when mount + watch refuse catalog wired. */
export function merchantTrackerBackendDoneBarMet(): boolean {
  return merchantMountMatrixComplete() && merchantDeclaredTaskMatchesGuardrail();
}

export function merchantMountVsTrackerBoardCard(): {
  readonly tracker: typeof MERCHANT_TRACKER_ID;
  readonly blocker: typeof MERCHANT_BLOCKER_TRACKER_ID;
  readonly doors: number;
  readonly doorsMounted: number;
  readonly gaps: number;
  readonly backendDoneBarMet: boolean;
  readonly mountComplete: boolean;
} {
  const mounted = merchantDoorsInRouterSource();
  return {
    tracker: MERCHANT_TRACKER_ID,
    blocker: MERCHANT_BLOCKER_TRACKER_ID,
    doors: MERCHANT_MOUNTED_DOORS.length,
    doorsMounted: mounted.length,
    gaps: MERCHANT_HONEST_GAPS.length,
    backendDoneBarMet: merchantTrackerBackendDoneBarMet(),
    mountComplete: mounted.length === MERCHANT_MOUNTED_DOORS.length,
  };
}
