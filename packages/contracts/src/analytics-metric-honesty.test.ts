import { describe, expect, it } from 'vitest';
import { ANALYTICS_METRICS_V0 } from './ops-analytics.js';
import {
  analyticsMetricCatalogBoardCard,
  analyticsMetricCatalogStatusLine,
  parseAnalyticsMetricCatalogStatusLine,
  analyticsMetricCatalogStatusLineMatches,
  analyticsMetricCatalogStatusLineConsistent,
  analyticsMetricCatalogExportHeader,
  analyticsMetricCatalogExportText,
  isDeclaredAnalyticsMetric,
  moneyMetricsRefuseNumber,
  ANALYTICS_METRIC_KINDS,
} from './analytics-metric-honesty.js';

describe('L3 wave119 analytics metric catalog honesty', () => {
  it('v0 metric catalog boards', () => {
    expect(ANALYTICS_METRICS_V0.length).toBeGreaterThanOrEqual(3);
    expect(ANALYTICS_METRIC_KINDS).toHaveLength(3);
    const card = analyticsMetricCatalogBoardCard();
    expect(card.metrics).toBe(ANALYTICS_METRICS_V0.length);
    expect(card.money + card.nonMoney).toBe(card.metrics);
    expect(analyticsMetricCatalogStatusLineMatches()).toBe(true);
    expect(analyticsMetricCatalogStatusLineConsistent(analyticsMetricCatalogStatusLine())).toBe(true);
    expect(analyticsMetricCatalogExportText().startsWith(analyticsMetricCatalogExportHeader())).toBe(true);
    expect(isDeclaredAnalyticsMetric('ledger.postings.count')).toBe(true);
    expect(isDeclaredAnalyticsMetric('invent.series')).toBe(false);
    expect(moneyMetricsRefuseNumber()).toBe(true);
    expect(parseAnalyticsMetricCatalogStatusLine('nope')).toBeNull();
  });
});
