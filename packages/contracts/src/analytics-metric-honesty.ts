/**
 * Contracts L3 — pure analytics metric catalog honesty (no warehouse invent).
 *
 * Mirrors ops-analytics.ts ANALYTICS_METRICS_V0 structural counts.
 */

import {
  ANALYTICS_METRICS_V0,
  analyticsMetricCatalogSize,
  listMoneyMetricIds,
  listNonMoneyMetricIds,
} from './ops-analytics.js';

export const ANALYTICS_METRIC_KINDS = ['count', 'amount', 'ratio'] as const;

/** L3 — catalog board. */
export function analyticsMetricCatalogBoardCard(): {
  readonly metrics: number;
  readonly money: number;
  readonly nonMoney: number;
  readonly kinds: number;
} {
  return {
    metrics: analyticsMetricCatalogSize(),
    money: listMoneyMetricIds().length,
    nonMoney: listNonMoneyMetricIds().length,
    kinds: ANALYTICS_METRIC_KINDS.length,
  };
}

/** L3 — status line. */
export function analyticsMetricCatalogStatusLine(): string {
  const c = analyticsMetricCatalogBoardCard();
  return `metrics=${c.metrics} money=${c.money} non_money=${c.nonMoney} kinds=${c.kinds}`;
}

/** L3 — parse status. */
export function parseAnalyticsMetricCatalogStatusLine(line: string): {
  readonly metrics: number;
  readonly money: number;
  readonly nonMoney: number;
  readonly kinds: number;
} | null {
  const m = line
    .trim()
    .match(/^metrics=(\d+) money=(\d+) non_money=(\d+) kinds=(\d+)$/);
  if (!m) return null;
  return {
    metrics: Number(m[1]),
    money: Number(m[2]),
    nonMoney: Number(m[3]),
    kinds: Number(m[4]),
  };
}

/** L3 — true when status matches. */
export function analyticsMetricCatalogStatusLineMatches(): boolean {
  const p = parseAnalyticsMetricCatalogStatusLine(analyticsMetricCatalogStatusLine());
  if (!p) return false;
  const c = analyticsMetricCatalogBoardCard();
  return (
    p.metrics === c.metrics &&
    p.money === c.money &&
    p.nonMoney === c.nonMoney &&
    p.kinds === c.kinds
  );
}

/** L3 — money+nonMoney equals metrics. */
export function analyticsMetricCatalogStatusLineConsistent(line: string): boolean {
  const p = parseAnalyticsMetricCatalogStatusLine(line);
  if (!p) return false;
  return p.metrics === p.money + p.nonMoney && p.kinds === 3;
}

/** L3 — export header. */
export function analyticsMetricCatalogExportHeader(): string {
  return 'id,kind,money';
}

/** L3 — export lines. */
export function analyticsMetricCatalogExportLines(): readonly string[] {
  return ANALYTICS_METRICS_V0.map((m) => `${m.id},${m.kind},${m.money ? 1 : 0}`);
}

/** L3 — full export. */
export function analyticsMetricCatalogExportText(): string {
  return [analyticsMetricCatalogExportHeader(), ...analyticsMetricCatalogExportLines()].join('\n');
}

/** L3 — metric id declared. */
export function isDeclaredAnalyticsMetric(id: string): boolean {
  return ANALYTICS_METRICS_V0.some((m) => m.id === id);
}

/** L3 — money metrics must not use number values (law board). */
export function moneyMetricsRefuseNumber(): boolean {
  return listMoneyMetricIds().length > 0;
}
