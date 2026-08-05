/**
 * Analytics L3 — pure consumer gate for cube points (Slice C light).
 *
 * Admin/BI may only accept points that pass assertMetricPoint.
 * Never invent series when the cube is empty.
 */

import { assertMetricPoint } from './ops-analytics.js';
import type { CubePoint } from './ops-analytics-cube.js';

export type ConsumeOk = {
  readonly status: 'ok';
  readonly points: readonly CubePoint[];
};

export type ConsumeRefuse = {
  readonly status: 'refuse';
  readonly reason: string;
};

export type ConsumeEmpty = {
  readonly status: 'empty';
};

export type ConsumeResult = ConsumeOk | ConsumeRefuse | ConsumeEmpty;

/**
 * Accept a cube series for a surface. Empty → empty (not invent zeros).
 * Any invalid money number → refuse whole batch (fail closed).
 */
export function consumeCubePoints(points: readonly CubePoint[]): ConsumeResult {
  if (points.length === 0) return { status: 'empty' };
  const out: CubePoint[] = [];
  for (const p of points) {
    const check = assertMetricPoint(p.metricId, p.value);
    if (!check.ok) {
      return { status: 'refuse', reason: `${p.metricId}: ${check.reason}` };
    }
    out.push(p);
  }
  return { status: 'ok', points: out };
}
