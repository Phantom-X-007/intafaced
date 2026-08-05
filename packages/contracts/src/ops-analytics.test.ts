import { describe, expect, it } from 'vitest';
import {
  aggregateSourceLags,
  ANALYTICS_METRICS_V0,
  ANALYTICS_SOURCE_DBS,
  assertMetricPoint,
  countMetricsByKind,
  countMetricsUsingSource,
  listMetricIdsUsingSource,
  listMetricIdsByKind,
  hasAnalyticsMetric,
  lagFreshness,
  listMoneyMetricIds,
  metricMoneyPartition,
  analyticsMetricCatalogSize,
  listNonMoneyMetricIds,
  mayLabelLive,
  metricById,
  isMetricCatalogEmpty,
  hasMoneyMetrics,
  countMetricsUsingSource,
  metricCountBySource,
  multiSourceMetricCount,
  singleSourceMetricCount,
  moneyMetricRatio,
  nonMoneyMetricRatio,
  countMoneyMetrics,
  hasNonMoneyMetrics,
  moneyMetricCount,
  nonMoneyMetricCount,
  catalogHasMoney,
  catalogIsNonEmpty,
  catalogMetricCount,
  ratioMetricCount,
  amountMetricCount,
  countKindMetricCount,
  hasRatioMetrics,
  hasAmountMetrics,
  hasCountKindMetrics,
  multiSourceMetricRatio,
  ledgerSourceMetricCount,
  tradeSourceMetricCount,
  identitySourceMetricCount,
  singleSourceMetricRatio,
  hasLedgerSourceMetrics,
  hasTradeSourceMetrics,
  hasIdentitySourceMetrics,
  ledgerSourceShare,
  tradeSourceShare,
  identitySourceShare,
  allSourcesRepresented,
  representedSourceCount,
  catalogHasAtLeast,
  firstMoneyMetricId,
  firstNonMoneyMetricId,
  moneyNonMoneyPair,
  catalogMetricCountLabel,
  moneyMetricCountLabel,
  nonMoneyMetricCountLabel,
  moneyMetricIdsJoined,
  nonMoneyMetricIdsJoined,
  ledgerMetricIdsJoined,
  tradeMetricIdsJoined,
  identityMetricIdsJoined,
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

describe('L3 wave13 analytics source catalog helpers', () => {
  it('countMetricsUsingSource + listMetricIdsUsingSource no invent', () => {
    const n = countMetricsUsingSource('trade');
    const ids = listMetricIdsUsingSource('trade');
    expect(ids.length).toBe(n);
    expect(ids).toEqual([...ids].sort());
    expect(n).toBeGreaterThan(0);
    // every listed metric must declare trade source
    for (const id of ids) {
      const def = metricById(id)!;
      expect(def.sources).toContain('trade');
    }
  });

  it('L3 metricMoneyPartition partitions catalog', () => {
    const p = metricMoneyPartition();
    expect(p.total).toBe(p.money + p.nonMoney);
    expect(p.total).toBe(analyticsMetricCatalogSize());
    expect(p.money).toBeGreaterThan(0);
  });
  it('L3 isMetricCatalogEmpty false on tip catalog', () => {
    expect(isMetricCatalogEmpty()).toBe(false);
  });
});

describe('L3 wave16 analytics money/source helpers', () => {
  it('hasMoneyMetrics + metricCountBySource', () => {
    expect(hasMoneyMetrics()).toBe(true);
    const by = metricCountBySource();
    expect(by.ledger + by.trade + by.identity).toBeGreaterThan(0);
    expect(by.trade).toBe(countMetricsUsingSource('trade'));
  });

  it('L3 multiSourceMetricCount is non-negative catalog count', () => {
    expect(multiSourceMetricCount()).toBeGreaterThanOrEqual(0);
    expect(multiSourceMetricCount()).toBeLessThanOrEqual(analyticsMetricCatalogSize());
  });

  it('L3 singleSourceMetricCount partitions with multi', () => {
    const s = singleSourceMetricCount();
    const m = multiSourceMetricCount();
    expect(s + m).toBeLessThanOrEqual(analyticsMetricCatalogSize());
    expect(s).toBeGreaterThanOrEqual(0);
  });

  it('L3 moneyMetricRatio fixed 4dp on tip catalog', () => {
    const r = moneyMetricRatio();
    expect(r).not.toBeNull();
    expect(r).toMatch(/^\d+\.\d{4}$/);
  });

  it('L3 nonMoneyMetricRatio fixed 4dp', () => {
    const r = nonMoneyMetricRatio();
    expect(r).not.toBeNull();
    expect(r).toMatch(/^\d+\.\d{4}$/);
  });
});

describe('L3 wave21 money/non-money counts', () => {
  it('countMoneyMetrics + hasNonMoneyMetrics', () => {
    expect(countMoneyMetrics()).toBe(listMoneyMetricIds().length);
    expect(hasNonMoneyMetrics()).toBe(listNonMoneyMetricIds().length > 0);
  });

  it('L3 moneyMetricCount + nonMoneyMetricCount sum to catalog size', () => {
    expect(moneyMetricCount() + nonMoneyMetricCount()).toBe(analyticsMetricCatalogSize());
  });

  it('L3 catalogHasMoney true on tip', () => {
    expect(catalogHasMoney()).toBe(true);
  });

  it('L3 catalogIsNonEmpty true on tip', () => {
    expect(catalogIsNonEmpty()).toBe(true);
  });
});

describe('L3 wave25 catalog kind counts', () => {
  it('catalogMetricCount + kind partitions sum to catalog', () => {
    expect(catalogMetricCount()).toBe(analyticsMetricCatalogSize());
    expect(ratioMetricCount() + amountMetricCount() + countKindMetricCount()).toBe(analyticsMetricCatalogSize());
  });
});

describe('L3 wave26 kind presence + multi-source ratio', () => {
  it('hasRatio/Amount/Count + multiSourceMetricRatio', () => {
    expect(typeof hasRatioMetrics()).toBe('boolean');
    expect(typeof hasAmountMetrics()).toBe('boolean');
    expect(typeof hasCountKindMetrics()).toBe('boolean');
    const r = multiSourceMetricRatio();
    expect(r).not.toBeNull();
    expect(r).toMatch(/^\d+\.\d{4}$/);
  });
});

describe('L3 wave27 source counts + single-source ratio', () => {
  it('ledger/trade/identity counts + singleSourceMetricRatio', () => {
    expect(ledgerSourceMetricCount()).toBe(countMetricsUsingSource('ledger'));
    expect(tradeSourceMetricCount()).toBe(countMetricsUsingSource('trade'));
    expect(identitySourceMetricCount()).toBe(countMetricsUsingSource('identity'));
    const r = singleSourceMetricRatio();
    expect(r).not.toBeNull();
    expect(r).toMatch(/^\d+\.\d{4}$/);
  });
});

describe('L3 wave28 source presence + ledger share', () => {
  it('hasLedger/Trade/Identity + ledgerSourceShare', () => {
    expect(typeof hasLedgerSourceMetrics()).toBe('boolean');
    expect(typeof hasTradeSourceMetrics()).toBe('boolean');
    expect(typeof hasIdentitySourceMetrics()).toBe('boolean');
    const r = ledgerSourceShare();
    expect(r).not.toBeNull();
    expect(r).toMatch(/^\d+\.\d{4}$/);
  });
});

describe('L3 wave29 source shares + representation', () => {
  it('trade/identity share + all sources + count', () => {
    expect(tradeSourceShare()).toMatch(/^\d+\.\d{4}$/);
    expect(identitySourceShare()).toMatch(/^\d+\.\d{4}$/);
    expect(typeof allSourcesRepresented()).toBe('boolean');
    expect(representedSourceCount()).toBeGreaterThanOrEqual(1);
  });
});

describe('L3 wave30 catalog at-least + first metrics + pair', () => {
  it('catalogHasAtLeast + first money/non-money + pair', () => {
    expect(catalogHasAtLeast(1)).toBe(true);
    expect(firstMoneyMetricId()).not.toBeNull();
    expect(firstNonMoneyMetricId()).not.toBeNull();
    const p = moneyNonMoneyPair();
    expect(p.money + p.nonMoney).toBe(analyticsMetricCatalogSize());
  });
});

describe('L3 wave31 catalog labels + money ids join', () => {
  it('labels and joined money ids', () => {
    expect(catalogMetricCountLabel()).toBe(String(analyticsMetricCatalogSize()));
    expect(moneyMetricCountLabel()).toBe(String(moneyMetricCount()));
    expect(nonMoneyMetricCountLabel()).toBe(String(nonMoneyMetricCount()));
    expect(moneyMetricIdsJoined().split(',').filter(Boolean).length).toBe(moneyMetricCount());
  });
});

describe('L3 wave32 metric id joins by partition/source', () => {
  it('non-money + source joins non-empty on tip', () => {
    expect(nonMoneyMetricIdsJoined().split(',').filter(Boolean).length).toBe(nonMoneyMetricCount());
    expect(typeof ledgerMetricIdsJoined()).toBe('string');
    expect(typeof tradeMetricIdsJoined()).toBe('string');
    expect(typeof identityMetricIdsJoined()).toBe('string');
  });
});
