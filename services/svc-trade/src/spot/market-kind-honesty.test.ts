import { describe, expect, it } from 'vitest';
import {
  marketKindCatalogBoardCard,
  marketKindCatalogStatusLine,
  parseMarketKindCatalogStatusLine,
  marketKindCatalogStatusLineMatches,
  marketKindCatalogStatusLineConsistent,
  marketKindCatalogExportHeader,
  marketKindCatalogExportLines,
  marketKindCatalogExportText,
  isDeclaredMarketKind,
  MARKET_KINDS,
} from './market-kind-honesty.js';

describe('L3 wave182 market-kind catalog honesty', () => {
  it('market kind catalog boards', () => {
    expect(MARKET_KINDS).toEqual(['spot', 'futures', 'options']);
    expect(marketKindCatalogBoardCard()).toEqual({
      kinds: 3,
      hasSpot: 1,
      hasFutures: 1,
      hasOptions: 1,
    });
    expect(marketKindCatalogStatusLine()).toBe('kinds=3 spot=1 futures=1 options=1');
    expect(marketKindCatalogStatusLineMatches()).toBe(true);
    expect(marketKindCatalogStatusLineConsistent(marketKindCatalogStatusLine())).toBe(true);
    expect(marketKindCatalogExportText().startsWith(marketKindCatalogExportHeader())).toBe(true);
    expect(marketKindCatalogExportLines()).toEqual([...MARKET_KINDS]);
    expect(isDeclaredMarketKind('spot')).toBe(true);
    expect(isDeclaredMarketKind('swap')).toBe(false);
    expect(parseMarketKindCatalogStatusLine('nope')).toBeNull();
  });
});
