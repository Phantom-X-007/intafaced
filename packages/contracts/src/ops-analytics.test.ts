import { describe, expect, it } from 'vitest';
import {
  aggregateSourceLags,
  ANALYTICS_METRICS_V0,
  ANALYTICS_SOURCE_DBS,
  analyticsAmountString,
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
  moneyMetricRatioLabel,
  nonMoneyMetricRatioLabel,
  multiSourceMetricRatioLabel,
  singleSourceMetricRatioLabel,
  catalogMoneySnapshot,
  catalogMoneyCountsConsistent,
  catalogKindSnapshot,
  catalogKindCountsConsistent,
  analyticsCatalogBoardCard,
  analyticsCatalogBoardNonEmpty,
  analyticsMoneyBoard,
  analyticsKindBoard,
  searchMetricIds,
  filterMetricIdsByKind,
  metricSearchHasHits,
  metricSearchHitCount,
  pageMetricIds,
  pageMoneyMetricIds,
  metricCatalogPageCount,
  reverseMetricIds,
  moneyMetricIdsOnly,
  metricIdsOnlyInKind,
  moneyMinusNonMoneyCount,
  multiEqualsSingleSourceCount,
  safePageMetricIds,
  clampMetricPageIndex,
  metricIdsAtPage,
  isValidMetricPage,
  metricsExportLines,
  metricsExportHeader,
  metricsExportText,
  metricsExportLineCount,
  parseMetricsExportLine,
  countMetricsExportDataLines,
  metricsExportHasHeader,
  metricsExportRoundTripOk,
  analyticsStatusLine,
  analyticsStatusLineIsEmpty,
  analyticsStatusLineDetailed,
  analyticsStatusLineTokenCount,
  parseAnalyticsStatusLine,
  analyticsStatusLineMatches,
  parseAnalyticsStatusLineDetailed,
  analyticsStatusLineConsistent,
  catalogSizeInRange,
  moneyMetricCountAtLeast,
  clampMetricPageSize,
  multiSourceCountAtMost,
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
    expect(analyticsAmountString.safeParse(12.5).success).toBe(false);
    expect(analyticsAmountString.safeParse(12.5).error?.issues[0]?.message).toMatch(/JS number refused/);
    expect(analyticsAmountString.safeParse('12.50').success).toBe(true);
    expect(analyticsAmountString.safeParse(-1).success).toBe(false);
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

describe('L3 wave33 analytics ratio labels', () => {
  it('money/non-money/multi/single ratio labels', () => {
    expect(moneyMetricRatioLabel()).toMatch(/^\d+\.\d{4}$/);
    expect(nonMoneyMetricRatioLabel()).toMatch(/^\d+\.\d{4}$/);
    expect(multiSourceMetricRatioLabel()).toMatch(/^\d+\.\d{4}$/);
    expect(singleSourceMetricRatioLabel()).toMatch(/^\d+\.\d{4}$/);
  });
});

describe('L3 wave34 catalog money/kind snapshots', () => {
  it('money + kind partitions consistent', () => {
    expect(catalogMoneyCountsConsistent()).toBe(true);
    expect(catalogKindCountsConsistent()).toBe(true);
    expect(catalogMoneySnapshot().total).toBe(analyticsMetricCatalogSize());
    expect(catalogKindSnapshot().total).toBe(analyticsMetricCatalogSize());
  });
});

describe('L3 wave36 analytics catalog board', () => {
  it('board card + money/kind boards', () => {
    expect(analyticsCatalogBoardNonEmpty()).toBe(true);
    const c = analyticsCatalogBoardCard();
    expect(c.total).toBe(analyticsMetricCatalogSize());
    expect(analyticsMoneyBoard().total).toBe(c.total);
    expect(analyticsKindBoard().total).toBe(c.total);
  });
});

describe('L3 wave37 metric search + kind filter', () => {
  it('search + filter + hit counts', () => {
    expect(searchMetricIds('')).toEqual([]);
    expect(metricSearchHasHits('')).toBe(false);
    const any = listMoneyMetricIds()[0] ?? listNonMoneyMetricIds()[0];
    if (any) {
      expect(metricSearchHitCount(any.slice(0, 3))).toBeGreaterThan(0);
      expect(metricSearchHasHits(any.slice(0, 3))).toBe(true);
    }
    expect(filterMetricIdsByKind('count').length).toBe(countKindMetricCount());
  });
});

describe('L3 wave38 metric catalog paging', () => {
  it('page ids + money page + page count + reverse', () => {
    expect(pageMetricIds({ offset: 0, limit: 1 })).toHaveLength(1);
    expect(pageMoneyMetricIds({ limit: 100 }).length).toBe(moneyMetricCount());
    expect(metricCatalogPageCount(5)).toBeGreaterThan(0);
    const all = pageMetricIds({ limit: 1000 });
    expect(reverseMetricIds()[0]).toBe(all[all.length - 1]);
  });
});

describe('L3 metric catalog paging limit unset refuse', () => {
  it('pageMetricIds / pageMoneyMetricIds refuse omit / NaN — never invent all.length', () => {
    expect(() => pageMetricIds({} as { limit: number })).toThrow(/limit is unset.*never invent all\.length/);
    expect(() => pageMetricIds({ offset: 0 } as { offset: number; limit: number })).toThrow(/never invent all\.length/);
    expect(() => pageMetricIds({ limit: Number.NaN })).toThrow(/limit is unset/);
    expect(() => pageMoneyMetricIds({} as { limit: number })).toThrow(/never invent all\.length/);
    expect(() => pageMoneyMetricIds({ limit: Number.NaN })).toThrow(/limit is unset/);
    expect(pageMetricIds({ limit: 0 })).toEqual([]);
    expect(pageMetricIds({ offset: 0, limit: 1 })).toHaveLength(1);
  });
});

describe('L3 wave39 analytics compare helpers', () => {
  it('money-only + kind exclude + deltas', () => {
    expect(moneyMetricIdsOnly().length).toBe(moneyMetricCount());
    expect(metricIdsOnlyInKind('count', 'amount').length).toBe(countKindMetricCount());
    expect(typeof moneyMinusNonMoneyCount()).toBe('number');
    expect(typeof multiEqualsSingleSourceCount()).toBe('boolean');
  });
});

describe('L3 wave40 metric safe paging', () => {
  it('safe page + clamp + at page + valid', () => {
    expect(safePageMetricIds(0, 1)).toHaveLength(1);
    expect(clampMetricPageIndex(99, 1)).toBeGreaterThanOrEqual(0);
    expect(metricIdsAtPage(0, 1)).toHaveLength(1);
    expect(isValidMetricPage(0, 5)).toBe(true);
    expect(isValidMetricPage(-1, 5)).toBe(false);
  });
});

describe('L3 wave41 metrics export', () => {
  it('export lines/text/count', () => {
    expect(metricsExportHeader()).toBe('id,kind,money');
    expect(metricsExportLines().length).toBe(analyticsMetricCatalogSize());
    expect(metricsExportLineCount()).toBe(1 + analyticsMetricCatalogSize());
    expect(metricsExportText()).toContain('id,kind,money');
  });
});

describe('L3 wave42 metrics export parse + round-trip', () => {
  it('parse + header + round-trip', () => {
    expect(parseMetricsExportLine('id,kind,money')).toBeNull();
    const line = metricsExportLines()[0]!;
    expect(parseMetricsExportLine(line)).not.toBeNull();
    const text = metricsExportText();
    expect(metricsExportHasHeader(text)).toBe(true);
    expect(countMetricsExportDataLines(text)).toBe(analyticsMetricCatalogSize());
    expect(metricsExportRoundTripOk()).toBe(true);
  });
});

describe('L3 wave44 analytics status lines', () => {
  it('status lines non-empty on tip', () => {
    expect(analyticsStatusLineIsEmpty()).toBe(false);
    expect(analyticsStatusLine()).toContain('total=');
    expect(analyticsStatusLineDetailed()).toContain('sources=');
    expect(analyticsStatusLineTokenCount()).toBe(6);
  });
});

describe('L3 wave45 analytics status parse + match', () => {
  it('parse + match + consistent', () => {
    expect(analyticsStatusLineMatches()).toBe(true);
    expect(analyticsStatusLineConsistent(analyticsStatusLine())).toBe(true);
    expect(parseAnalyticsStatusLine(analyticsStatusLine())).not.toBeNull();
    expect(parseAnalyticsStatusLineDetailed(analyticsStatusLineDetailed())).not.toBeNull();
  });
});

describe('L3 wave46 analytics thresholds + clamps', () => {
  it('range + atLeast + clamp + atMost', () => {
    expect(catalogSizeInRange(1, 10000)).toBe(true);
    expect(moneyMetricCountAtLeast(0)).toBe(true);
    expect(clampMetricPageSize(1)).toBe(1);
    expect(multiSourceCountAtMost(10000)).toBe(true);
  });
});
