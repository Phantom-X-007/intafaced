/**
 * D26-P1-X1 — connect.latency-grading mount vs tracker honest gaps.
 *
 * Measurement-not-estimate fabric; execution.sor consumes grades via scoreSorCost.
 * Default thresholds remain Class X. WS handshake (`ws-round-trip`) is measured;
 * depth-delta delivery lag is still unmeasured (quiet book ≠ slow stream).
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describeLatencyGradingPolicy } from './fabric/latency-policy.js';

export const LATENCY_GRADING_TRACKER_ID = 'connect.latency-grading' as const;

export const LATENCY_PRODUCT_SYMBOLS = ['measuredLatencyMs', 'routingWeightFromGrade', 'describeLatencyGradingPolicy'] as const;

export type LatencyProductSymbol = (typeof LATENCY_PRODUCT_SYMBOLS)[number];

export const LATENCY_HONEST_GAPS = [
  'gap.default_thresholds_owner_unruled',
  'gap.depth_delta_delivery_lag_not_measured',
  'gap.unmeasured_latency_ms_sentinel',
] as const;

export function latencySymbolsInFabricSource(): readonly LatencyProductSymbol[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const latencySrc = readFileSync(join(here, 'fabric', 'latency.ts'), 'utf8');
  const policySrc = readFileSync(join(here, 'fabric', 'latency-policy.ts'), 'utf8');
  const costSrc = readFileSync(join(here, 'cost-model.ts'), 'utf8');
  const blob = [latencySrc, policySrc, costSrc].join('\n');
  return LATENCY_PRODUCT_SYMBOLS.filter((name) => new RegExp(`\\b${name}\\b`).test(blob));
}

export function sorConsumesLatencyGrade(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  const costSrc = readFileSync(join(here, 'cost-model.ts'), 'utf8');
  return (
    /\blatencyGrade\b/.test(costSrc) &&
    /\bscoreSorCost\b/.test(costSrc) &&
    /\bliveLatencyScoreMs\b/.test(costSrc) &&
    /\bunscored_latency\b/.test(costSrc)
  );
}

export function latencyDoneBarTestsPresent(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  return (
    existsSync(join(here, 'fabric', 'latency.test.ts')) &&
    existsSync(join(here, 'fabric', 'latency-policy.test.ts')) &&
    existsSync(join(here, 'sor-cost-refuse-pin.test.ts'))
  );
}

export function latencyPolicyHonest(): boolean {
  const p = describeLatencyGradingPolicy();
  return (
    p.measurementNotEstimate === true &&
    p.unscoredRoutingWeightZero === true &&
    p.ungradedIsNotLowScore === true &&
    p.inventsLetterToBpsScaling === false &&
    p.inventsDefaultGrade === false
  );
}

export function latencyGradingTrackerBackendDoneBarMet(): boolean {
  return (
    latencySymbolsInFabricSource().length === LATENCY_PRODUCT_SYMBOLS.length &&
    sorConsumesLatencyGrade() &&
    latencyDoneBarTestsPresent() &&
    latencyPolicyHonest()
  );
}

export function latencyGradingMountVsTrackerBoardCard(): {
  readonly tracker: typeof LATENCY_GRADING_TRACKER_ID;
  readonly symbols: number;
  readonly symbolsPresent: number;
  readonly sorConsumer: boolean;
  readonly gaps: number;
  readonly backendDoneBarMet: boolean;
} {
  const present = latencySymbolsInFabricSource();
  return {
    tracker: LATENCY_GRADING_TRACKER_ID,
    symbols: LATENCY_PRODUCT_SYMBOLS.length,
    symbolsPresent: present.length,
    sorConsumer: sorConsumesLatencyGrade(),
    gaps: LATENCY_HONEST_GAPS.length,
    backendDoneBarMet: latencyGradingTrackerBackendDoneBarMet(),
  };
}
