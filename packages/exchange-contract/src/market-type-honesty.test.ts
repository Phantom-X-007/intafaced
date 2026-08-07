import { describe, expect, it } from 'vitest';
import {
  publicMarketTypeCatalogBoardCard,
  publicMarketTypeCatalogStatusLine,
  parsePublicMarketTypeCatalogStatusLine,
  publicMarketTypeCatalogStatusLineMatches,
  publicMarketTypeCatalogStatusLineConsistent,
  publicMarketTypeCatalogExportHeader,
  publicMarketTypeCatalogExportLines,
  publicMarketTypeCatalogExportText,
  isDeclaredPublicMarketType,
  PUBLIC_MARKET_TYPES,
} from './market-type-honesty.js';

describe('L3 wave198 public market-type catalog honesty', () => {
  it('public market type catalog boards', () => {
    expect(PUBLIC_MARKET_TYPES).toEqual(['spot', 'swap', 'future', 'option']);
    expect(publicMarketTypeCatalogBoardCard()).toEqual({
      types: 4,
      hasSpot: 1,
      hasSwap: 1,
      hasFuture: 1,
      hasOption: 1,
    });
    expect(publicMarketTypeCatalogStatusLine()).toBe('types=4 spot=1 swap=1 future=1 option=1');
    expect(publicMarketTypeCatalogStatusLineMatches()).toBe(true);
    expect(publicMarketTypeCatalogStatusLineConsistent(publicMarketTypeCatalogStatusLine())).toBe(true);
    expect(publicMarketTypeCatalogExportText().startsWith(publicMarketTypeCatalogExportHeader())).toBe(true);
    expect(publicMarketTypeCatalogExportLines()).toEqual([...PUBLIC_MARKET_TYPES]);
    expect(isDeclaredPublicMarketType('swap')).toBe(true);
    expect(isDeclaredPublicMarketType('futures')).toBe(false);
    expect(parsePublicMarketTypeCatalogStatusLine('nope')).toBeNull();
  });
});
