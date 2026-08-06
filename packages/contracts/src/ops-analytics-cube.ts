/**
 * OPS ANALYTICS — Slice B cube layer (TRK-ops.analytics).
 *
 * Metric definitions → named SQL/view hints + pure fixture evaluation.
 * No warehouse process, no OLTP write, no invented rollups offline.
 *
 * Fixture rows are the only numbers that enter a cube result. Empty fixture
 * → zero / empty series (never a fabricated dashboard walk).
 */

import { ANALYTICS_METRICS_V0, assertMetricPoint, type AnalyticsMetricDef } from './ops-analytics.js';

/** One fact row from a read replica / fixture (not a live invent). */
export type CubeFactRow = {
  readonly metricId: string;
  /** Decimal string for money metrics; integer string for counts. */
  readonly value: string;
  /** Optional group key (asset, market, day). */
  readonly dim?: string;
};

export type CubeViewDef = {
  readonly metricId: string;
  /** Documented SQL/view — not executed in Slice B; fixture tests prove shape. */
  readonly sqlView: string;
  readonly money: boolean;
};

/** View catalogue mapped 1:1 to ANALYTICS_METRICS_V0. */
export const CUBE_VIEWS_V0: readonly CubeViewDef[] = ANALYTICS_METRICS_V0.map((m) => ({
  metricId: m.id,
  money: m.money || m.kind === 'amount',
  sqlView: sqlViewFor(m),
}));

function sqlViewFor(m: AnalyticsMetricDef): string {
  switch (m.id) {
    case 'ledger.postings.count':
      return 'CREATE VIEW analytics.ledger_postings_count AS SELECT count(*)::text AS value FROM ledger.journal_lines WHERE posted_at IS NOT NULL;';
    case 'ledger.volume.notional':
      return 'CREATE VIEW analytics.ledger_volume_notional AS SELECT coalesce(sum(abs(amount::numeric)), 0)::text AS value FROM ledger.journal_lines WHERE posted_at IS NOT NULL; -- amount stays decimal text on wire';
    case 'trade.fills.count':
      return 'CREATE VIEW analytics.trade_fills_count AS SELECT count(*)::text AS value FROM trade.fills WHERE settled_at IS NOT NULL;';
    default:
      return `-- view residual for ${m.id}: ${m.factHint}`;
  }
}

export function cubeViewByMetric(metricId: string): CubeViewDef | undefined {
  return CUBE_VIEWS_V0.find((v) => v.metricId === metricId);
}

export type CubePoint = {
  readonly metricId: string;
  readonly value: string;
  readonly dim: string | null;
};

export type CubeResult =
  { readonly status: 'ok'; readonly points: readonly CubePoint[] } | { readonly status: 'refuse'; readonly reason: string };

/**
 * Evaluate fixture facts into cube points.
 * Refuses unknown metrics and money-as-number (via assertMetricPoint).
 * Missing metric in fixtures → no point (not a zero invent unless caller supplies 0).
 */
/**
 * L3 — filter cube facts by optional dim allowlist before evaluate.
 * Empty dims → no filter. Unknown dim after filter → empty result (not invent).
 */
export function filterCubeFactsByDim(
  facts: readonly CubeFactRow[],
  dims: ReadonlySet<string> | readonly string[] | undefined,
): readonly CubeFactRow[] {
  if (!dims) return facts;
  const set = dims instanceof Set ? dims : new Set(dims);
  if (set.size === 0) return facts;
  return facts.filter((f) => f.dim != null && set.has(f.dim));
}

export function evaluateCubeFixtures(facts: readonly CubeFactRow[]): CubeResult {
  const points: CubePoint[] = [];
  for (const row of facts) {
    const check = assertMetricPoint(row.metricId, row.value);
    if (!check.ok) {
      return { status: 'refuse', reason: `${row.metricId}: ${check.reason}` };
    }
    if (!cubeViewByMetric(row.metricId)) {
      return { status: 'refuse', reason: `no cube view for ${row.metricId}` };
    }
    points.push({
      metricId: row.metricId,
      value: row.value,
      dim: row.dim ?? null,
    });
  }
  return { status: 'ok', points };
}

/**
 * Aggregate count metrics that share an id (sum of integer strings).
 * Money metrics refuse aggregate here — callers must pre-sum as decimal strings.
 */
export function sumCountFixtures(facts: readonly CubeFactRow[], metricId: string): CubeResult {
  const def = ANALYTICS_METRICS_V0.find((m) => m.id === metricId);
  if (!def) return { status: 'refuse', reason: `unknown metric ${metricId}` };
  if (def.money || def.kind === 'amount') {
    return { status: 'refuse', reason: 'money metrics must not use integer sum helper' };
  }
  let total = 0n;
  let seen = 0;
  for (const row of facts) {
    if (row.metricId !== metricId) continue;
    const check = assertMetricPoint(metricId, row.value);
    if (!check.ok) return { status: 'refuse', reason: check.reason };
    total += BigInt(row.value);
    seen += 1;
  }
  if (seen === 0) {
    return { status: 'ok', points: [{ metricId, value: '0', dim: null }] };
  }
  return { status: 'ok', points: [{ metricId, value: total.toString(), dim: null }] };
}

/**
 * L3 — distinct non-null dims present in fixtures (sorted).
 * Never invents a dim that no fact carries.
 */
export function listPresentDims(facts: readonly CubeFactRow[]): readonly string[] {
  const set = new Set<string>();
  for (const row of facts) {
    if (row.dim != null && row.dim !== '') set.add(row.dim);
  }
  return [...set].sort();
}
