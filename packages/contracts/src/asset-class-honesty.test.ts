import { describe, expect, it } from 'vitest';
import {
  assetClassCatalogBoardCard,
  assetClassCatalogStatusLine,
  parseAssetClassCatalogStatusLine,
  assetClassCatalogStatusLineMatches,
  assetClassCatalogStatusLineConsistent,
  assetClassCatalogExportHeader,
  assetClassCatalogExportLines,
  assetClassCatalogExportText,
  isDeclaredAssetClass,
  ASSET_CLASSES,
} from './asset-class-honesty.js';

describe('L3 wave150 asset class catalog honesty', () => {
  it('asset class catalog boards', () => {
    expect(ASSET_CLASSES).toEqual(['crypto', 'commodity', 'forex']);
    expect(assetClassCatalogBoardCard()).toEqual({
      classes: 3,
      hasCrypto: 1,
      hasCommodity: 1,
      hasForex: 1,
    });
    expect(assetClassCatalogStatusLine()).toBe('classes=3 crypto=1 commodity=1 forex=1');
    expect(assetClassCatalogStatusLineMatches()).toBe(true);
    expect(assetClassCatalogStatusLineConsistent(assetClassCatalogStatusLine())).toBe(true);
    expect(assetClassCatalogExportText().startsWith(assetClassCatalogExportHeader())).toBe(true);
    expect(assetClassCatalogExportLines()).toEqual([...ASSET_CLASSES]);
    expect(isDeclaredAssetClass('forex')).toBe(true);
    expect(isDeclaredAssetClass('equity')).toBe(false);
    expect(parseAssetClassCatalogStatusLine('nope')).toBeNull();
  });
});
