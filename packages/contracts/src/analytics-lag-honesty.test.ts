import { describe, expect, it } from 'vitest';
import {
  lagFreshnessFromSeconds,
  analyticsLagCatalogBoardCard,
  analyticsLagCatalogStatusLine,
  parseAnalyticsLagCatalogStatusLine,
  analyticsLagCatalogStatusLineMatches,
  analyticsLagCatalogStatusLineConsistent,
  lagObservationBoardCard,
  lagObservationStatusLine,
  parseLagObservationStatusLine,
  lagObservationStatusLineMatches,
  lagObservationStatusLineConsistent,
  lagObservationExportHeader,
  lagObservationExportLine,
  lagObservationExportText,
  isDeclaredAnalyticsSource,
  unknownLagNeverLive,
  ANALYTICS_SOURCE_DB_CATALOG,
} from './analytics-lag-honesty.js';

describe('L3 wave93 analytics lag honesty', () => {
  it('catalog and lag freshness boards', () => {
    expect(ANALYTICS_SOURCE_DB_CATALOG).toEqual(['ledger', 'trade', 'identity']);
    expect(analyticsLagCatalogBoardCard()).toEqual({
      sources: 3,
      freshnessValues: 4,
      liveMaxLag: 60,
      warnLag: 30,
    });
    expect(analyticsLagCatalogStatusLineMatches()).toBe(true);
    expect(analyticsLagCatalogStatusLineConsistent(analyticsLagCatalogStatusLine())).toBe(true);
    expect(parseAnalyticsLagCatalogStatusLine('nope')).toBeNull();

    expect(lagFreshnessFromSeconds(null)).toBe('unknown');
    expect(lagFreshnessFromSeconds(10)).toBe('live');
    expect(lagFreshnessFromSeconds(45)).toBe('delayed');
    expect(lagFreshnessFromSeconds(90)).toBe('stale');
    expect(unknownLagNeverLive()).toBe(true);

    expect(lagObservationBoardCard(null)).toEqual({
      lag: 'null',
      freshness: 'unknown',
      isLive: 0,
    });
    expect(lagObservationStatusLine(10)).toBe('lag=10 freshness=live live=1');
    expect(lagObservationStatusLineMatches(10)).toBe(true);
    expect(lagObservationStatusLineConsistent(lagObservationStatusLine(10))).toBe(true);
    expect(lagObservationExportText(45).startsWith(lagObservationExportHeader())).toBe(true);
    expect(lagObservationExportLine(45)).toBe('45,delayed,0');
    expect(isDeclaredAnalyticsSource('ledger')).toBe(true);
    expect(isDeclaredAnalyticsSource('pay')).toBe(false);
    expect(parseLagObservationStatusLine('nope')).toBeNull();
  });
});
