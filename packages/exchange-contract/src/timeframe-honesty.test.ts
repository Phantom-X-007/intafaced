import { describe, expect, it } from 'vitest';
import {
  timeframeCatalogBoardCard,
  timeframeCatalogStatusLine,
  parseTimeframeCatalogStatusLine,
  timeframeCatalogStatusLineMatches,
  timeframeCatalogStatusLineConsistent,
  timeframeCatalogExportHeader,
  timeframeCatalogExportLines,
  timeframeCatalogExportText,
  isDeclaredTimeframe,
  TIMEFRAMES,
} from './timeframe-honesty.js';

describe('L3 wave197 timeframe catalog honesty', () => {
  it('timeframe catalog boards', () => {
    expect(TIMEFRAMES).toHaveLength(14);
    expect(TIMEFRAMES[0]).toBe('1m');
    expect(TIMEFRAMES[TIMEFRAMES.length - 1]).toBe('1M');
    expect(timeframeCatalogBoardCard()).toEqual({
      timeframes: 14,
      has1m: 1,
      has1h: 1,
      has1d: 1,
      has1M: 1,
    });
    expect(timeframeCatalogStatusLine()).toBe('timeframes=14 m1=1 h1=1 d1=1 M1=1');
    expect(timeframeCatalogStatusLineMatches()).toBe(true);
    expect(timeframeCatalogStatusLineConsistent(timeframeCatalogStatusLine())).toBe(true);
    expect(timeframeCatalogExportText().startsWith(timeframeCatalogExportHeader())).toBe(true);
    expect(timeframeCatalogExportLines()).toEqual([...TIMEFRAMES]);
    expect(isDeclaredTimeframe('15m')).toBe(true);
    expect(isDeclaredTimeframe('7d')).toBe(false);
    expect(parseTimeframeCatalogStatusLine('nope')).toBeNull();
  });
});
