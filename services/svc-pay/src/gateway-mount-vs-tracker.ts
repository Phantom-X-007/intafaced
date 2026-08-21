/**
 * D26-P1-P1 — pay.gateway mount vs tracker honest gaps.
 *
 * Backend product-complete: hosted checkout, merchant onboarding, payment lifecycle.
 * Card acquiring absent + KYB echo-only are Class X / socket residuals.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PAY_GATEWAY_TRACKER_ID = 'pay.gateway' as const;

export const GATEWAY_MOUNTED_SURFACES = ['checkout', 'merchant', 'payment'] as const;

export type GatewayMountedSurface = (typeof GATEWAY_MOUNTED_SURFACES)[number];

export const GATEWAY_CORE_DOORS = ['open', 'status', 'create', 'createLink', 'authorize', 'capture', 'refund', 'get', 'list'] as const;

export const GATEWAY_HONEST_GAPS = [
  'gap.card_acquiring_absent_not_sandbox',
  'gap.kyb_status_no_consumer',
  'gap.socket_psp_partners',
] as const;

export function gatewaySurfacesInRouterSource(): readonly GatewayMountedSurface[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, 'router.ts'), 'utf8');
  return GATEWAY_MOUNTED_SURFACES.filter((surface) => new RegExp(`\\b${surface}:\\s*router\\(`).test(src));
}

export function gatewayCoreDoorsMounted(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, 'router.ts'), 'utf8');
  return GATEWAY_CORE_DOORS.every((door) => new RegExp(`\\b${door}\\s*:`).test(src));
}

export function hostedCheckoutPagePresent(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  return existsSync(join(here, 'checkout-page.ts')) && existsSync(join(here, 'checkout-page.test.ts'));
}

export function gatewayMountTestsPresent(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  return existsSync(join(here, 'router.mount.test.ts'));
}

export function payGatewayTrackerBackendDoneBarMet(): boolean {
  return (
    gatewaySurfacesInRouterSource().length === GATEWAY_MOUNTED_SURFACES.length &&
    gatewayCoreDoorsMounted() &&
    hostedCheckoutPagePresent() &&
    gatewayMountTestsPresent()
  );
}

export function payGatewayMountVsTrackerBoardCard(): {
  readonly tracker: typeof PAY_GATEWAY_TRACKER_ID;
  readonly surfaces: number;
  readonly surfacesMounted: number;
  readonly gaps: number;
  readonly backendDoneBarMet: boolean;
} {
  const mounted = gatewaySurfacesInRouterSource();
  return {
    tracker: PAY_GATEWAY_TRACKER_ID,
    surfaces: GATEWAY_MOUNTED_SURFACES.length,
    surfacesMounted: mounted.length,
    gaps: GATEWAY_HONEST_GAPS.length,
    backendDoneBarMet: payGatewayTrackerBackendDoneBarMet(),
  };
}
