import { describe, expect, it } from 'vitest';
import { PLATFORM_KB_SPINE } from './kb-catalog.js';
import {
  kbCatalogBoardCard,
  kbCatalogStatusLine,
  parseKbCatalogStatusLine,
  kbCatalogStatusLineMatches,
  kbCatalogStatusLineConsistent,
  kbCatalogExportHeader,
  kbCatalogExportLine,
  kbCatalogExportText,
  kbCatalogHasId,
  kbArticleCountInRange,
  kbCatalogAllSupportPrefixed,
} from './kb-catalog-honesty.js';

describe('L3 wave98 KB catalog honesty', () => {
  it('platform spine boards', () => {
    const spine = PLATFORM_KB_SPINE;
    expect(spine.length).toBeGreaterThanOrEqual(5);
    expect(kbCatalogBoardCard(spine).articles).toBe(spine.length);
    expect(kbCatalogAllSupportPrefixed(spine)).toBe(true);
    expect(kbCatalogStatusLineMatches(spine)).toBe(true);
    expect(kbCatalogStatusLineConsistent(kbCatalogStatusLine(spine))).toBe(true);
    expect(kbCatalogExportText(spine).startsWith(kbCatalogExportHeader())).toBe(true);
    expect(kbCatalogExportLine(spine).startsWith(`${spine.length},`)).toBe(true);
    expect(kbCatalogHasId(spine, 'kb-account-access')).toBe(true);
    expect(kbCatalogHasId(spine, 'kb-vendor-binance')).toBe(false);
    expect(kbArticleCountInRange(spine, spine.length, spine.length)).toBe(true);
    expect(parseKbCatalogStatusLine('nope')).toBeNull();

    const empty: readonly { id: string; titleKey: string; bodyKey: string }[] = [];
    expect(kbCatalogBoardCard(empty).articles).toBe(0);
    expect(kbCatalogStatusLineMatches(empty)).toBe(true);
  });
});
