import { describe, expect, it } from 'vitest';
import {
  otcPriceTypeCatalogBoardCard,
  otcPriceTypeCatalogStatusLine,
  parseOtcPriceTypeCatalogStatusLine,
  otcPriceTypeCatalogStatusLineMatches,
  otcPriceTypeCatalogStatusLineConsistent,
  otcPriceTypeCatalogExportHeader,
  otcPriceTypeCatalogExportLines,
  otcPriceTypeCatalogExportText,
  isDeclaredOtcPriceType,
  OTC_PRICE_TYPES,
} from './otc-price-type-honesty.js';

describe('L3 wave223 otc-price-type catalog honesty', () => {
  it('otc price type catalog boards', () => {
    expect(OTC_PRICE_TYPES).toEqual(['fixed', 'float']);
    expect(otcPriceTypeCatalogBoardCard()).toEqual({
      types: 2,
      hasFixed: 1,
      hasFloat: 1,
    });
    expect(otcPriceTypeCatalogStatusLine()).toBe('types=2 fixed=1 float=1');
    expect(otcPriceTypeCatalogStatusLineMatches()).toBe(true);
    expect(otcPriceTypeCatalogStatusLineConsistent(otcPriceTypeCatalogStatusLine())).toBe(true);
    expect(otcPriceTypeCatalogExportText().startsWith(otcPriceTypeCatalogExportHeader())).toBe(true);
    expect(otcPriceTypeCatalogExportLines()).toEqual([...OTC_PRICE_TYPES]);
    expect(isDeclaredOtcPriceType('float')).toBe(true);
    expect(isDeclaredOtcPriceType('index')).toBe(false);
    expect(parseOtcPriceTypeCatalogStatusLine('nope')).toBeNull();
  });
});
