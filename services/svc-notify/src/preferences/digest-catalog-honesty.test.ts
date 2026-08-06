import { describe, expect, it } from 'vitest';
import {
  digestCatalogBoardCard,
  digestCatalogStatusLine,
  parseDigestCatalogStatusLine,
  digestCatalogStatusLineMatches,
  digestCatalogStatusLineConsistent,
  digestPrefsBoardCard,
  digestPrefsStatusLine,
  parseDigestPrefsStatusLine,
  digestPrefsStatusLineMatches,
  digestPrefsStatusLineConsistent,
  digestPrefsExportHeader,
  digestPrefsExportLine,
  digestPrefsExportText,
  isDeclaredDigestCadence,
  DIGEST_CADENCES,
} from './digest-catalog-honesty.js';

describe('L3 wave84 digest catalog honesty', () => {
  it('catalog and prefs boards', () => {
    expect(DIGEST_CADENCES).toHaveLength(3);
    expect(digestCatalogBoardCard()).toEqual({
      cadences: 3,
      criticalMayDigest: 0,
      defaultCadence: 'off',
    });
    expect(digestCatalogStatusLineMatches()).toBe(true);
    expect(digestCatalogStatusLineConsistent(digestCatalogStatusLine())).toBe(true);
    expect(parseDigestCatalogStatusLine('nope')).toBeNull();

    const off = { cadence: 'off' as const };
    expect(digestPrefsBoardCard(off)).toEqual({ cadence: 'off', isOff: 1, batches: 0 });
    expect(digestPrefsStatusLineMatches(off)).toBe(true);

    const hourly = { cadence: 'hourly' as const };
    expect(digestPrefsStatusLine(hourly)).toBe('cadence=hourly off=0 batches=1');
    expect(digestPrefsStatusLineMatches(hourly)).toBe(true);
    expect(digestPrefsStatusLineConsistent(digestPrefsStatusLine(hourly))).toBe(true);
    expect(digestPrefsExportText(hourly).startsWith(digestPrefsExportHeader())).toBe(true);
    expect(digestPrefsExportLine(hourly)).toBe('hourly,0,1');
    expect(isDeclaredDigestCadence('daily')).toBe(true);
    expect(isDeclaredDigestCadence('weekly')).toBe(false);
    expect(parseDigestPrefsStatusLine('nope')).toBeNull();
  });
});
