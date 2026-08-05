/**
 * OPS ANALYTICS — Slice A contract (TRK-ops.analytics).
 *
 * Replica + lag law only. No cube SQL, no warehouse process, no write path.
 * Money figures on any future metric MUST be decimal strings (never JS number).
 *
 * ── Source databases (read replicas; OLTP remains SoT) ─────────────────────
 *   · ledger  — money movements (svc-ledger)
 *   · trade   — orders/fills facts (svc-trade)
 *   · identity — non-money cohort dims only (no balances)
 *
 * Analytics MUST NOT post ledger. Fail-closed: if lag is unknown or over SLO,
 * surfaces must not label series as "live".
 */

import { z } from 'zod';

/** Databases that may feed a future read replica / warehouse. */
export const ANALYTICS_SOURCE_DBS = ['ledger', 'trade', 'identity'] as const;
export type AnalyticsSourceDb = (typeof ANALYTICS_SOURCE_DBS)[number];

/**
 * Lag SLO defaults (seconds). Product may tighten; never loosen fail-closed.
 * Over this lag → refuse "live" label.
 */
export const ANALYTICS_LAG_SLO_SECONDS = {
  /** Default max lag for any "live" operator label. */
  liveMaxLagSeconds: 60,
  /** Soft warn band (still not "live" if over liveMax). */
  warnLagSeconds: 30,
} as const;

export type LagFreshness = 'live' | 'delayed' | 'stale' | 'unknown';

/**
 * Fail-closed freshness from observed lag.
 * unknown lag → unknown (never "live").
 */
export function lagFreshness(lagSeconds: number | null | undefined): LagFreshness {
  if (lagSeconds === null || lagSeconds === undefined || !Number.isFinite(lagSeconds) || lagSeconds < 0) {
    return 'unknown';
  }
  if (lagSeconds <= ANALYTICS_LAG_SLO_SECONDS.warnLagSeconds) return 'live';
  if (lagSeconds <= ANALYTICS_LAG_SLO_SECONDS.liveMaxLagSeconds) return 'delayed';
  return 'stale';
}

/** True only when the surface may paint a "live" badge. */
export function mayLabelLive(lagSeconds: number | null | undefined): boolean {
  return lagFreshness(lagSeconds) === 'live';
}

/**
 * L3 — multi-source lag rollup. Live label only if EVERY known source is live.
 * Unknown or missing lag on any source → overall unknown (never invent live).
 */
export type SourceLag = {
  readonly source: AnalyticsSourceDb;
  readonly lagSeconds: number | null | undefined;
};

export type AggregateLag = {
  readonly overall: LagFreshness;
  readonly mayLabelLive: boolean;
  readonly bySource: Readonly<Record<AnalyticsSourceDb, LagFreshness>>;
  readonly worstLagSeconds: number | null;
};

export function aggregateSourceLags(lags: readonly SourceLag[]): AggregateLag {
  const bySource = {
    ledger: 'unknown' as LagFreshness,
    trade: 'unknown' as LagFreshness,
    identity: 'unknown' as LagFreshness,
  };
  let worst: number | null = null;
  for (const row of lags) {
    const f = lagFreshness(row.lagSeconds);
    bySource[row.source] = f;
    if (row.lagSeconds != null && Number.isFinite(row.lagSeconds) && row.lagSeconds >= 0) {
      worst = worst === null ? row.lagSeconds : Math.max(worst, row.lagSeconds);
    }
  }
  const values = Object.values(bySource);
  let overall: LagFreshness = 'live';
  if (values.some((v) => v === 'unknown')) overall = 'unknown';
  else if (values.some((v) => v === 'stale')) overall = 'stale';
  else if (values.some((v) => v === 'delayed')) overall = 'delayed';
  return {
    overall,
    mayLabelLive: overall === 'live',
    bySource,
    worstLagSeconds: worst,
  };
}

/** Decimal amount on the wire — never number. */
export const analyticsAmountString = z.string().regex(/^-?\d+(\.\d{1,18})?$/, 'analytics amounts are decimal strings (max 18dp)');

export const analyticsMetricKind = z.enum(['count', 'amount', 'ratio']);

/**
 * Metric definition — maps a product name to source facts.
 * `sqlHint` is documentation only in Slice A (no execution).
 */
export const analyticsMetricDefSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().min(1).max(160),
  kind: analyticsMetricKind,
  sources: z.array(z.enum(ANALYTICS_SOURCE_DBS)).min(1),
  /** Human-readable mapping to ledger/trade facts — not executable SQL yet. */
  factHint: z.string().min(8).max(2000),
  /** If kind=amount, values must use analyticsAmountString at the consumer. */
  money: z.boolean(),
});

export type AnalyticsMetricDef = z.infer<typeof analyticsMetricDefSchema>;

/** v0 metric catalogue — definitions only; no offline invented numbers. */
export const ANALYTICS_METRICS_V0: readonly AnalyticsMetricDef[] = [
  {
    id: 'ledger.postings.count',
    title: 'Ledger postings (count)',
    kind: 'count',
    sources: ['ledger'],
    factHint: 'Count of posted journal lines in ledger OLTP / replica — never invent.',
    money: false,
  },
  {
    id: 'ledger.volume.notional',
    title: 'Ledger notional volume',
    kind: 'amount',
    sources: ['ledger'],
    factHint: 'Sum of absolute posted amounts as decimal strings from ledger facts.',
    money: true,
  },
  {
    id: 'trade.fills.count',
    title: 'Trade fills (count)',
    kind: 'count',
    sources: ['trade'],
    factHint: 'Count of settled fills in trade service facts.',
    money: false,
  },
] as const;

export function metricById(id: string): AnalyticsMetricDef | undefined {
  return ANALYTICS_METRICS_V0.find((m) => m.id === id);
}

/**
 * L3 — non-money metric ids only (safe for integer cube helpers).
 * Money metrics stay out so operators cannot mis-sum notional as count.
 */
export function listNonMoneyMetricIds(): readonly string[] {
  return ANALYTICS_METRICS_V0.filter((m) => !m.money && m.kind !== 'amount').map((m) => m.id);
}

/**
 * L3 — money / amount metric ids only (must use decimal strings).
 */
export function listMoneyMetricIds(): readonly string[] {
  return ANALYTICS_METRICS_V0.filter((m) => m.money || m.kind === 'amount').map((m) => m.id);
}

/** L3 — total v0 metric definitions (catalog size, no invent series). */
export function analyticsMetricCatalogSize(): number {
  return ANALYTICS_METRICS_V0.length;
}

/** Validate a consumer point — amount metrics require decimal strings. */
export function assertMetricPoint(metricId: string, value: string | number): { ok: true } | { ok: false; reason: string } {
  const def = metricById(metricId);
  if (!def) return { ok: false, reason: `unknown metric ${metricId}` };
  if (def.money || def.kind === 'amount') {
    if (typeof value === 'number') {
      return { ok: false, reason: 'money metrics refuse JS number — use decimal string' };
    }
    const parsed = analyticsAmountString.safeParse(value);
    if (!parsed.success) return { ok: false, reason: parsed.error.issues[0]?.message ?? 'invalid amount' };
  } else if (def.kind === 'count') {
    if (typeof value === 'number') {
      if (!Number.isInteger(value) || value < 0) return { ok: false, reason: 'count must be non-negative integer' };
    } else if (!/^\d+$/.test(value)) {
      return { ok: false, reason: 'count must be non-negative integer string' };
    }
  }
  return { ok: true };
}

/**
 * L3 — whether catalog defines metric id (unknown → false; never invent series).
 */
export function hasAnalyticsMetric(metricId: string): boolean {
  const id = metricId.trim();
  if (!id) return false;
  return metricById(id) != null;
}

/**
 * L3 — count of metrics by kind in v0 catalog (no invent).
 */
export function countMetricsByKind(kind: 'count' | 'amount' | 'ratio'): number {
  return ANALYTICS_METRICS_V0.filter((m) => m.kind === kind).length;
}

/**
 * L3 — metric ids of one kind (sorted). Empty kind → [].
 */
export function listMetricIdsByKind(kind: 'count' | 'amount' | 'ratio'): readonly string[] {
  return ANALYTICS_METRICS_V0.filter((m) => m.kind === kind)
    .map((m) => m.id)
    .sort();
}

/**
 * L3 — how many v0 metrics declare a given source DB (catalog only; no invent series).
 */
export function countMetricsUsingSource(source: AnalyticsSourceDb): number {
  return ANALYTICS_METRICS_V0.filter((m) => m.sources.includes(source)).length;
}

/**
 * L3 — money vs non-money catalog sizes (partition of v0; no invent).
 */
export function metricMoneyPartition(): { readonly money: number; readonly nonMoney: number; readonly total: number } {
  const money = listMoneyMetricIds().length;
  const nonMoney = listNonMoneyMetricIds().length;
  return { money, nonMoney, total: money + nonMoney };
}

/** L3 — true when v0 catalog has zero metrics (should not happen on tip). */
export function isMetricCatalogEmpty(): boolean {
  return analyticsMetricCatalogSize() === 0;
}

/**
 * L3 — sorted metric ids that touch a source. Unknown source key still returns [] via filter.
 */
export function listMetricIdsUsingSource(source: AnalyticsSourceDb): readonly string[] {
  return ANALYTICS_METRICS_V0.filter((m) => m.sources.includes(source))
    .map((m) => m.id)
    .sort();
}

/**
 * L3 — true when catalog has at least one money/amount metric (decimal-string law).
 */
export function hasMoneyMetrics(): boolean {
  return listMoneyMetricIds().length > 0;
}

/**
 * L3 — how many v0 metrics declare more than one source DB. Empty catalog → 0.
 */
export function multiSourceMetricCount(): number {
  return ANALYTICS_METRICS_V0.filter((m) => m.sources.length > 1).length;
}

/**
 * L3 — per-source metric counts (catalog only; no invent series).
 */
export function metricCountBySource(): Readonly<Record<AnalyticsSourceDb, number>> {
  return {
    ledger: countMetricsUsingSource('ledger'),
    trade: countMetricsUsingSource('trade'),
    identity: countMetricsUsingSource('identity'),
  };
}

/**
 * L3 — how many v0 metrics declare exactly one source. Empty → 0.
 */
export function singleSourceMetricCount(): number {
  return ANALYTICS_METRICS_V0.filter((m) => m.sources.length === 1).length;
}

/**
 * L3 — money/total as fixed 4dp string. Empty catalog → null (never invent 0).
 */
export function moneyMetricRatio(): string | null {
  const part = metricMoneyPartition();
  if (part.total === 0) return null;
  return (part.money / part.total).toFixed(4);
}

/**
 * L3 — non-money/total as fixed 4dp string. Empty catalog → null.
 */
export function nonMoneyMetricRatio(): string | null {
  const part = metricMoneyPartition();
  if (part.total === 0) return null;
  return (part.nonMoney / part.total).toFixed(4);
}

/**
 * L3 — count of money/amount metrics in catalog.
 */
export function countMoneyMetrics(): number {
  return listMoneyMetricIds().length;
}

/**
 * L3 — true when catalog has any non-money metric.
 */
export function hasNonMoneyMetrics(): boolean {
  return listNonMoneyMetricIds().length > 0;
}

/** L3 — count of money/amount metrics in v0 catalog. */
export function moneyMetricCount(): number {
  return listMoneyMetricIds().length;
}

/** L3 — count of non-money metrics in v0 catalog. */
export function nonMoneyMetricCount(): number {
  return listNonMoneyMetricIds().length;
}

/** L3 — alias of hasMoneyMetrics. */
export function catalogHasMoney(): boolean {
  return hasMoneyMetrics();
}

/** L3 — true when v0 catalog has at least one metric. */
export function catalogIsNonEmpty(): boolean {
  return !isMetricCatalogEmpty();
}

/** L3 — alias of analyticsMetricCatalogSize. */
export function catalogMetricCount(): number {
  return analyticsMetricCatalogSize();
}

/** L3 — count of ratio-kind metrics in v0 catalog. */
export function ratioMetricCount(): number {
  return countMetricsByKind('ratio');
}

/** L3 — count of amount-kind metrics in v0 catalog. */
export function amountMetricCount(): number {
  return countMetricsByKind('amount');
}

/** L3 — count of count-kind metrics in v0 catalog. */
export function countKindMetricCount(): number {
  return countMetricsByKind('count');
}

/** L3 — true when catalog has any ratio-kind metric. */
export function hasRatioMetrics(): boolean {
  return countMetricsByKind('ratio') > 0;
}

/** L3 — true when catalog has any amount-kind metric. */
export function hasAmountMetrics(): boolean {
  return countMetricsByKind('amount') > 0;
}

/** L3 — true when catalog has any count-kind metric. */
export function hasCountKindMetrics(): boolean {
  return countMetricsByKind('count') > 0;
}

/**
 * L3 — multi-source / total as fixed 4dp. Empty catalog → null.
 */
export function multiSourceMetricRatio(): string | null {
  const total = analyticsMetricCatalogSize();
  if (total === 0) return null;
  return (multiSourceMetricCount() / total).toFixed(4);
}

/** L3 — ledger-source metric count. */
export function ledgerSourceMetricCount(): number {
  return countMetricsUsingSource('ledger');
}

/** L3 — trade-source metric count. */
export function tradeSourceMetricCount(): number {
  return countMetricsUsingSource('trade');
}

/** L3 — identity-source metric count. */
export function identitySourceMetricCount(): number {
  return countMetricsUsingSource('identity');
}

/**
 * L3 — single-source / total as fixed 4dp. Empty → null.
 */
export function singleSourceMetricRatio(): string | null {
  const total = analyticsMetricCatalogSize();
  if (total === 0) return null;
  return (singleSourceMetricCount() / total).toFixed(4);
}

/** L3 — true when ledger is used by any metric. */
export function hasLedgerSourceMetrics(): boolean {
  return countMetricsUsingSource('ledger') > 0;
}

/** L3 — true when trade is used by any metric. */
export function hasTradeSourceMetrics(): boolean {
  return countMetricsUsingSource('trade') > 0;
}

/** L3 — true when identity is used by any metric. */
export function hasIdentitySourceMetrics(): boolean {
  return countMetricsUsingSource('identity') > 0;
}

/**
 * L3 — ledger/total share as fixed 4dp (by source membership, not exclusive). Empty → null.
 */
export function ledgerSourceShare(): string | null {
  const total = analyticsMetricCatalogSize();
  if (total === 0) return null;
  return (countMetricsUsingSource('ledger') / total).toFixed(4);
}
