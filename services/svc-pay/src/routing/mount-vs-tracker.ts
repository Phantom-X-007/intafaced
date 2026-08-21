/**
 * D26-P1-P3 — pay.routing mount vs tracker honest gaps.
 *
 * Backend product-complete: geo/method/risk smart rail selection on hosted checkout.
 * Live acquiring / PSP connectors and approval-rate invent remain Class X.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describeRoutingPolicy } from '../routing-policy.js';

export const PAY_ROUTING_TRACKER_ID = 'pay.routing' as const;

export const ROUTING_MOUNTED_DOORS = ['policy', 'assertInputs', 'select'] as const;

export type RoutingMountedDoor = (typeof ROUTING_MOUNTED_DOORS)[number];

export const ROUTING_PRODUCT_SYMBOLS = ['selectSmartCheckoutRail', 'describeRoutingPolicy', 'assertRoutingInputsPresent'] as const;

export const ROUTING_HONEST_GAPS = ['gap.class_x_live_acquiring', 'gap.class_x_approval_rates'] as const;

export function routingDoorsInRouterSource(): readonly RoutingMountedDoor[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const routerPath = join(here, '..', 'router.ts');
  const src = readFileSync(routerPath, 'utf8');
  const start = src.search(/^\s{4}routing:\s*router\(\{/m);
  if (start === -1) return [];
  const next = src.slice(start + 1).search(/^\s{4}[a-zA-Z]+:\s*router\(\{/m);
  const block = next === -1 ? src.slice(start) : src.slice(start, start + 1 + next);
  return ROUTING_MOUNTED_DOORS.filter((door) => new RegExp(`\\b${door}\\s*:`).test(block));
}

export function routingSymbolsInProductSource(): readonly (typeof ROUTING_PRODUCT_SYMBOLS)[number][] {
  const here = dirname(fileURLToPath(import.meta.url));
  const decideSrc = readFileSync(join(here, 'decide.ts'), 'utf8');
  const policySrc = readFileSync(join(here, '..', 'routing-policy.ts'), 'utf8');
  const inputsSrc = readFileSync(join(here, '..', 'routing-inputs.ts'), 'utf8');
  const paymentSrc = readFileSync(join(here, '..', 'payment-service.ts'), 'utf8');
  const blob = [decideSrc, policySrc, inputsSrc, paymentSrc].join('\n');
  return ROUTING_PRODUCT_SYMBOLS.filter((name) => new RegExp(`\\b${name}\\b`).test(blob));
}

export function routingDoneBarTestsPresent(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  const root = join(here, '..');
  return (
    existsSync(join(here, 'decide.test.ts')) &&
    existsSync(join(root, 'routing-policy.test.ts')) &&
    existsSync(join(root, 'routing-no-invent.test.ts'))
  );
}

export function routingPolicyHonest(): boolean {
  const p = describeRoutingPolicy();
  return p.inventsApprovalRates === false && p.inventsCostWeights === false && p.payerMayNameRail === false && p.movesValue === false;
}

export function payRoutingMountMatrixComplete(): boolean {
  return routingDoorsInRouterSource().length === ROUTING_MOUNTED_DOORS.length;
}

export function payRoutingTrackerBackendDoneBarMet(): boolean {
  return (
    payRoutingMountMatrixComplete() &&
    routingSymbolsInProductSource().length === ROUTING_PRODUCT_SYMBOLS.length &&
    routingDoneBarTestsPresent() &&
    routingPolicyHonest()
  );
}

export function payRoutingMountVsTrackerBoardCard(): {
  readonly tracker: typeof PAY_ROUTING_TRACKER_ID;
  readonly doors: number;
  readonly doorsMounted: number;
  readonly symbols: number;
  readonly symbolsPresent: number;
  readonly gaps: number;
  readonly backendDoneBarMet: boolean;
} {
  const mounted = routingDoorsInRouterSource();
  const symbols = routingSymbolsInProductSource();
  return {
    tracker: PAY_ROUTING_TRACKER_ID,
    doors: ROUTING_MOUNTED_DOORS.length,
    doorsMounted: mounted.length,
    symbols: ROUTING_PRODUCT_SYMBOLS.length,
    symbolsPresent: symbols.length,
    gaps: ROUTING_HONEST_GAPS.length,
    backendDoneBarMet: payRoutingTrackerBackendDoneBarMet(),
  };
}
