import { describe, expect, it } from 'vitest';
import {
  analyticsSourceCatalogBoardCard,
  analyticsSourceCatalogStatusLine,
  parseAnalyticsSourceCatalogStatusLine,
  analyticsSourceCatalogStatusLineMatches,
  analyticsSourceCatalogStatusLineConsistent,
  analyticsSourceCatalogExportHeader,
  analyticsSourceCatalogExportLines,
  analyticsSourceCatalogExportText,
  isDeclaredAnalyticsSourceDb,
  ANALYTICS_SOURCE_DBS,
} from './analytics-source-honesty.js';

describe('L3 wave117 analytics source catalog honesty', () => {
  it('source DB catalog boards', () => {
    expect(ANALYTICS_SOURCE_DBS).toEqual(['ledger', 'trade', 'identity']);
    expect(analyticsSourceCatalogBoardCard()).toEqual({
      sources: 3,
      hasLedger: 1,
      hasTrade: 1,
      hasIdentity: 1,
      hasPay: 0,
    });
    expect(analyticsSourceCatalogStatusLine()).toBe(
      'sources=3 ledger=1 trade=1 identity=1 pay=0',
    );
    expect(analyticsSourceCatalogStatusLineMatches()).toBe(true);
    expect(analyticsSourceCatalogStatusLineConsistent(analyticsSourceCatalogStatusLine())).toBe(
      true,
    );
    expect(analyticsSourceCatalogExportText().startsWith(analyticsSourceCatalogExportHeader())).toBe(
      true,
    );
    expect(analyticsSourceCatalogExportLines()).toEqual(['ledger', 'trade', 'identity']);
    expect(isDeclaredAnalyticsSourceDb('ledger')).toBe(true);
    expect(isDeclaredAnalyticsSourceDb('pay')).toBe(false);
    expect(parseAnalyticsSourceCatalogStatusLine('nope')).toBeNull();
  });
});
