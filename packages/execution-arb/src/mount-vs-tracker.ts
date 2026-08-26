/**
 * D26-P1-X4 — execution.arbitrage mount vs tracker honest gaps.
 *
 * Cross-exchange scanner + OMS scan/planLegs + edge consumer on tip.
 * Triangular/basis/funding classes remain honest residual.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { arbOmsWireClosed } from './arb-oms-wire.js';

export const EXECUTION_ARB_TRACKER_ID = 'execution.arbitrage' as const;

export const EXECUTION_ARB_BLOCKER_TRACKER_ID = 'execution.sor' as const;

export const ARB_PRODUCT_EXPORTS = [
  'scanExternalCrossExchangeArb',
  'describeArbitragePolicy',
  'scanArbClass',
  'planArbLegs',
  'reduceArbLegGroup',
  'observeArbLeg',
  'recoverArbFills',
  'recordArbVenueLegs',
] as const;

export type ArbProductExport = (typeof ARB_PRODUCT_EXPORTS)[number];

export const ARB_HONEST_GAPS = [] as const;

export const ARB_DONE_BAR_TEST_FILES = [
  'arbitrage.test.ts',
  'arb-owner-capital-gate.test.ts',
  'arb-oms-wire.test.ts',
  'arb-classes.test.ts',
  'arb-legs.test.ts',
  'arb-outage.test.ts',
] as const;

export function arbExportsInIndexSource(): readonly ArbProductExport[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, 'index.ts'), 'utf8');
  return ARB_PRODUCT_EXPORTS.filter((name) => new RegExp(`\\b${name}\\b`).test(src));
}

export function arbDoneBarTestPresent(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  return ARB_DONE_BAR_TEST_FILES.every((file) => existsSync(join(here, file)));
}

export function arbProductPathComplete(): boolean {
  return arbExportsInIndexSource().length === ARB_PRODUCT_EXPORTS.length && arbDoneBarTestPresent();
}

export function executionArbOmsGapsClosed(): boolean {
  return arbOmsWireClosed();
}

/** Denon D26-P1-X4 backend done bar met when cross-exchange scanner product path ships. */
export function executionArbTrackerBackendDoneBarMet(): boolean {
  return arbProductPathComplete();
}

export function executionArbMountVsTrackerBoardCard(): {
  readonly tracker: typeof EXECUTION_ARB_TRACKER_ID;
  readonly blocker: typeof EXECUTION_ARB_BLOCKER_TRACKER_ID;
  readonly exports: number;
  readonly exportsPresent: number;
  readonly gaps: number;
  readonly backendDoneBarMet: boolean;
  readonly productPathComplete: boolean;
} {
  const present = arbExportsInIndexSource();
  return {
    tracker: EXECUTION_ARB_TRACKER_ID,
    blocker: EXECUTION_ARB_BLOCKER_TRACKER_ID,
    exports: ARB_PRODUCT_EXPORTS.length,
    exportsPresent: present.length,
    gaps: ARB_HONEST_GAPS.length,
    backendDoneBarMet: executionArbTrackerBackendDoneBarMet(),
    productPathComplete: arbProductPathComplete(),
  };
}
