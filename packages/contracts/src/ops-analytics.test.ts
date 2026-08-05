import { describe, expect, it } from 'vitest';
import {
  aggregateSourceLags,
  ANALYTICS_METRICS_V0,
  ANALYTICS_SOURCE_DBS,
  assertMetricPoint,
  countMetricsByKind,
  listMetricIdsByKind,
  hasAnalyticsMetric,
  lagFreshness,
  listMoneyMetricIds,
  analyticsMetricCatalogSize,
  listNonMoneyMetricIds,
  mayLabelLive,
  metricById,
} from './ops-analytics.js';

describe('analytics Slice A — sources + lag fail-closed', () => {
  it('names the three source DBs', () => {
    expect(ANALYTICS_SOURCE_DBS).toEqual(['ledger', 'trade', 'identity']);
  });

  it('refuses live label when lag unknown or stale', () => {
    expect(lagFreshness(null)).toBe('unknown');
    expect(mayLabelLive(null)).toBe(false);
    expect(mayLabelLive(undefined)).toBe(false);
    expect(lagFreshness(10)).toBe('live');
    expect(mayLabelLive(10)).toBe(true);
    expect(lagFreshness(45)).toBe('delayed');
    expect(mayLabelLive(45)).toBe(false);
    expect(lagFreshness(120)).toBe('stale');
    expect(mayLabelLive(120)).toBe(false);
  });

  it('L3 aggregateSourceLags: all live required for overall live', () => {
    const live = aggregateSourceLags([
      { source: 'ledger', lagSeconds: 5 },
      { source: 'trade', lagSeconds: 8 },
      { source: 'identity', lagSeconds: 2 },
    ]);
    expect(live.overall).toBe('live');
    expect(live.mayLabelLive).toBe(true);
    expect(live.worstLagSeconds).toBe(8);

    const oneUnknown = aggregateSourceLags([
      { source: 'ledger', lagSeconds: 5 },
      { source: 'trade', lagSeconds: null },
    ]);
    expect(oneUnknown.overall).toBe('unknown');
    expect(oneUnknown.mayLabelLive).toBe(false);

    const stale = aggregateSourceLags([
      { source: 'ledger', lagSeconds: 5 },
      { source: 'trade', lagSeconds: 200 },
      { source: 'identity', lagSeconds: 5 },
    ]);
    expect(stale.overall).toBe('stale');
    expect(stale.mayLabelLive).toBe(false);
  });
});

describe('analytics metric catalogue v0', () => {
  it('ships at least one money metric that refuses JS number', () => {
    expect(ANALYTICS_METRICS_V0.some((m) => m.money)).toBe(true);
    const vol = metricById('ledger.volume.notional')!;
    expect(assertMetricPoint(vol.id, 12.5)).toEqual({
      ok: false,
      reason: 'money metrics refuse JS number — use decimal string',
    });
    expect(assertMetricPoint(vol.id, '12.50')).toEqual({ ok: true });
  });

  it('accepts integer counts', () => {
    expect(assertMetricPoint('trade.fills.count', 3)).toEqual({ ok: true });
    expect(assertMetricPoint('trade.fills.count', -1).ok).toBe(false);
  });

  it('L3 listNonMoneyMetricIds excludes money notional', () => {
    const ids = listNonMoneyMetricIds();
    expect(ids.length).toBeGreaterThan(0);
    expect(ids).toContain('trade.fills.count');
    expect(ids).not.toContain('ledger.volume.notional');
  });

  it('L3 listMoneyMetricIds is money-only complement', () => {
    const money = listMoneyMetricIds();
    expect(money).toContain('ledger.volume.notional');
    expect(money).not.toContain('trade.fills.count');
  });

  it('L3 analyticsMetricCatalogSize is stable catalog length', () => {
    expect(analyticsMetricCatalogSize()).toBe(ANALYTICS_METRICS_V0.length);
    expect(analyticsMetricCatalogSize()).toBeGreaterThan(0);
  });
});

describe('L3 wave10 analytics catalog helpers', () => {
  it('hasAnalyticsMetric is false for unknown / blank', () => {
    expect(hasAnalyticsMetric('trade.fills.count')).toBe(true);
    expect(hasAnalyticsMetric('no.such.metric')).toBe(false);
    expect(hasAnalyticsMetric('  ')).toBe(false);
  });

  it('countMetricsByKind partitions catalog without inventing', () => {
    const counts = countMetricsByKind('count');
    const amounts = countMetricsByKind('amount');
    const ratios = countMetricsByKind('ratio');
    expect(counts + amounts + ratios).toBe(ANALYTICS_METRICS_V0.length);
    expect(counts).toBeGreaterThan(0);
  });

  it('L3 listMetricIdsByKind returns only that kind', () => {
    const ids = listMetricIdsByKind('count');
    expect(ids.length).toBe(countMetricsByKind('count'));
    for (const id of ids) {
      expect(metricById(id)!.kind).toBe('count');
    }
  });
});
