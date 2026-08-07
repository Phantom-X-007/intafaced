import { describe, expect, it } from 'vitest';
import {
  publicTifCatalogBoardCard,
  publicTifCatalogStatusLine,
  parsePublicTifCatalogStatusLine,
  publicTifCatalogStatusLineMatches,
  publicTifCatalogStatusLineConsistent,
  publicTifCatalogExportHeader,
  publicTifCatalogExportLines,
  publicTifCatalogExportText,
  isDeclaredPublicTif,
  PUBLIC_TIFS,
} from './public-tif-honesty.js';

describe('L3 wave205 public-tif catalog honesty', () => {
  it('public tif catalog boards', () => {
    expect(PUBLIC_TIFS).toEqual(['GTC', 'IOC', 'FOK', 'PO']);
    expect(publicTifCatalogBoardCard()).toEqual({
      tifs: 4,
      hasGtc: 1,
      hasIoc: 1,
      hasFok: 1,
      hasPo: 1,
    });
    expect(publicTifCatalogStatusLine()).toBe('tifs=4 gtc=1 ioc=1 fok=1 po=1');
    expect(publicTifCatalogStatusLineMatches()).toBe(true);
    expect(publicTifCatalogStatusLineConsistent(publicTifCatalogStatusLine())).toBe(true);
    expect(publicTifCatalogExportText().startsWith(publicTifCatalogExportHeader())).toBe(true);
    expect(publicTifCatalogExportLines()).toEqual([...PUBLIC_TIFS]);
    expect(isDeclaredPublicTif('FOK')).toBe(true);
    expect(isDeclaredPublicTif('GTD')).toBe(false);
    expect(parsePublicTifCatalogStatusLine('nope')).toBeNull();
  });
});
