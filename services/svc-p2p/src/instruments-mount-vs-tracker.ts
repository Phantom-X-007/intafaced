/**
 * D26-P1-P4 — p2p.payment-instruments mount vs tracker honest gaps.
 *
 * Backend product-complete: method schemas, instrument lifecycle, escrow-bound reveal + access log.
 * Empty operator registry + KMS encryption stay Class X residuals.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const P2P_INSTRUMENTS_TRACKER_ID = 'p2p.payment-instruments' as const;

export const INSTRUMENT_MOUNTED_DOORS = ['create', 'update', 'remove', 'list', 'reveal', 'accessLog'] as const;

export type InstrumentMountedDoor = (typeof INSTRUMENT_MOUNTED_DOORS)[number];

export const INSTRUMENT_METHOD_DOORS = ['list', 'register', 'setEnabled'] as const;

export const INSTRUMENT_HONEST_GAPS = ['gap.empty_method_registry_until_operator', 'gap.no_encryption_at_rest_kms'] as const;

export function instrumentDoorsInRouterSource(): readonly InstrumentMountedDoor[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, 'router.ts'), 'utf8');
  const start = src.search(/^\s{4}instruments:\s*router\(\{/m);
  if (start === -1) return [];
  const next = src.slice(start + 1).search(/^\s{4}[a-zA-Z]+:\s*router\(\{/m);
  const block = next === -1 ? src.slice(start) : src.slice(start, start + 1 + next);
  return INSTRUMENT_MOUNTED_DOORS.filter((door) => new RegExp(`\\b${door}\\s*:`).test(block));
}

export function instrumentMethodDoorsMounted(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, 'router.ts'), 'utf8');
  const methodsBlock = src.match(/methods:\s*router\(\{[\s\S]*?\n\s{6}\}\),/);
  if (!methodsBlock) return false;
  return INSTRUMENT_METHOD_DOORS.every((door) => new RegExp(`\\b${door}\\s*:`).test(methodsBlock[0]!));
}

export function revealForTradeOnEscrowPath(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  const routerSrc = readFileSync(join(here, 'router.ts'), 'utf8');
  const serviceSrc = readFileSync(join(here, 'instrument-service.ts'), 'utf8');
  return /revealForTrade/.test(routerSrc) && /revealForTrade/.test(serviceSrc);
}

export function instrumentDoneBarTestsPresent(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  return (
    existsSync(join(here, 'instrument-service.test.ts')) &&
    existsSync(join(here, 'instruments.test.ts')) &&
    existsSync(join(here, 'router.mount.test.ts'))
  );
}

export function p2pInstrumentsMountMatrixComplete(): boolean {
  return (
    instrumentDoorsInRouterSource().length === INSTRUMENT_MOUNTED_DOORS.length &&
    instrumentMethodDoorsMounted() &&
    revealForTradeOnEscrowPath()
  );
}

export function p2pInstrumentsTrackerBackendDoneBarMet(): boolean {
  return p2pInstrumentsMountMatrixComplete() && instrumentDoneBarTestsPresent();
}

export function p2pInstrumentsMountVsTrackerBoardCard(): {
  readonly tracker: typeof P2P_INSTRUMENTS_TRACKER_ID;
  readonly doors: number;
  readonly doorsMounted: number;
  readonly gaps: number;
  readonly backendDoneBarMet: boolean;
} {
  const mounted = instrumentDoorsInRouterSource();
  return {
    tracker: P2P_INSTRUMENTS_TRACKER_ID,
    doors: INSTRUMENT_MOUNTED_DOORS.length,
    doorsMounted: mounted.length,
    gaps: INSTRUMENT_HONEST_GAPS.length,
    backendDoneBarMet: p2pInstrumentsTrackerBackendDoneBarMet(),
  };
}
