import { describe, expect, it } from 'vitest';
import {
  timeInForceCatalogBoardCard,
  timeInForceCatalogStatusLine,
  parseTimeInForceCatalogStatusLine,
  timeInForceCatalogStatusLineMatches,
  timeInForceCatalogStatusLineConsistent,
  timeInForceCatalogExportHeader,
  timeInForceCatalogExportLines,
  timeInForceCatalogExportText,
  isDeclaredTimeInForce,
  TIME_IN_FORCE,
} from './time-in-force-honesty.js';

describe('L3 wave185 time-in-force catalog honesty', () => {
  it('time in force catalog boards', () => {
    expect(TIME_IN_FORCE).toEqual(['GTC', 'IOC', 'FOK', 'PO']);
    expect(timeInForceCatalogBoardCard()).toEqual({
      tifs: 4,
      hasGtc: 1,
      hasIoc: 1,
      hasFok: 1,
      hasPo: 1,
    });
    expect(timeInForceCatalogStatusLine()).toBe('tifs=4 gtc=1 ioc=1 fok=1 po=1');
    expect(timeInForceCatalogStatusLineMatches()).toBe(true);
    expect(timeInForceCatalogStatusLineConsistent(timeInForceCatalogStatusLine())).toBe(true);
    expect(timeInForceCatalogExportText().startsWith(timeInForceCatalogExportHeader())).toBe(true);
    expect(timeInForceCatalogExportLines()).toEqual([...TIME_IN_FORCE]);
    expect(isDeclaredTimeInForce('IOC')).toBe(true);
    expect(isDeclaredTimeInForce('DAY')).toBe(false);
    expect(parseTimeInForceCatalogStatusLine('nope')).toBeNull();
  });
});
