/**
 * D26-P1-P2 — pay.payfac mount vs tracker honest gaps.
 *
 * Backend product-complete: sub-merchant trees, eleven permission areas, REST+tRPC fences.
 * Settling-party partner + split-fee recipes stay honest §13 sockets.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PAY_PAYFAC_TRACKER_ID = 'pay.payfac' as const;

export const PAYFAC_PRODUCT_SYMBOLS = ['PAYFAC_SURFACE_AREAS', 'permissionAreaCoverage', 'areaForSurface'] as const;

export const PAYFAC_SOCKET_IDS = ['socket.payfac-settling-party-partner', 'socket.payfac-split-fee-recipes'] as const;

export const PAYFAC_HONEST_GAPS = [...PAYFAC_SOCKET_IDS] as const;

export function payfacSymbolsInProductSource(): readonly (typeof PAYFAC_PRODUCT_SYMBOLS)[number][] {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, 'payfac-permissions.ts'), 'utf8');
  return PAYFAC_PRODUCT_SYMBOLS.filter((name) => new RegExp(`\\b${name}\\b`).test(src));
}

export function payfacSocketsNamedInSource(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, 'payfac-permissions.ts'), 'utf8');
  return PAYFAC_SOCKET_IDS.every((id) => src.includes(id));
}

export function payfacAreaTestsPresent(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  return (
    existsSync(join(here, 'payfac-permissions.test.ts')) &&
    existsSync(join(here, 'public-rest.payfac-permissions.test.ts')) &&
    existsSync(join(here, 'router.payfac-area.test.ts'))
  );
}

export function payfacPolicyHonest(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, 'payfac-permissions.ts'), 'utf8');
  return (
    /SHIPPED_PAYFAC_AREA_COUNT\s*=\s*11/.test(src) &&
    /MONEY_PERMISSION_AREAS/.test(src) &&
    /checkout\.open/.test(src) &&
    /public payer door/.test(src) &&
    payfacSocketsNamedInSource()
  );
}

export function payPayfacTrackerBackendDoneBarMet(): boolean {
  return payfacSymbolsInProductSource().length === PAYFAC_PRODUCT_SYMBOLS.length && payfacAreaTestsPresent() && payfacPolicyHonest();
}

export function payPayfacMountVsTrackerBoardCard(): {
  readonly tracker: typeof PAY_PAYFAC_TRACKER_ID;
  readonly symbols: number;
  readonly symbolsPresent: number;
  readonly gaps: number;
  readonly backendDoneBarMet: boolean;
} {
  const present = payfacSymbolsInProductSource();
  return {
    tracker: PAY_PAYFAC_TRACKER_ID,
    symbols: PAYFAC_PRODUCT_SYMBOLS.length,
    symbolsPresent: present.length,
    gaps: PAYFAC_HONEST_GAPS.length,
    backendDoneBarMet: payPayfacTrackerBackendDoneBarMet(),
  };
}
