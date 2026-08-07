import { describe, expect, it } from 'vitest';
import {
  marketStatusCatalogBoardCard,
  marketStatusCatalogStatusLine,
  parseMarketStatusCatalogStatusLine,
  marketStatusCatalogStatusLineMatches,
  marketStatusCatalogStatusLineConsistent,
  marketStatusCatalogExportHeader,
  marketStatusCatalogExportLines,
  marketStatusCatalogExportText,
  isDeclaredMarketStatus,
  MARKET_STATUSES,
} from './market-status-honesty.js';

describe('L3 wave188 market-status catalog honesty', () => {
  it('market status catalog boards', () => {
    expect(MARKET_STATUSES).toEqual(['pending', 'active', 'halted', 'delisted']);
    expect(marketStatusCatalogBoardCard()).toEqual({
      statuses: 4,
      hasPending: 1,
      hasActive: 1,
      hasHalted: 1,
      hasDelisted: 1,
    });
    expect(marketStatusCatalogStatusLine()).toBe('statuses=4 pending=1 active=1 halted=1 delisted=1');
    expect(marketStatusCatalogStatusLineMatches()).toBe(true);
    expect(marketStatusCatalogStatusLineConsistent(marketStatusCatalogStatusLine())).toBe(true);
    expect(marketStatusCatalogExportText().startsWith(marketStatusCatalogExportHeader())).toBe(true);
    expect(marketStatusCatalogExportLines()).toEqual([...MARKET_STATUSES]);
    expect(isDeclaredMarketStatus('halted')).toBe(true);
    expect(isDeclaredMarketStatus('suspended')).toBe(false);
    expect(parseMarketStatusCatalogStatusLine('nope')).toBeNull();
  });
});
