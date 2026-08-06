import { describe, expect, it } from 'vitest';
import {
  cardSizeCatalogBoardCard,
  cardSizeCatalogStatusLine,
  parseCardSizeCatalogStatusLine,
  cardSizeCatalogStatusLineMatches,
  cardSizeCatalogStatusLineConsistent,
  cardSizeCatalogExportHeader,
  cardSizeCatalogExportLines,
  cardSizeCatalogExportText,
  isDeclaredCardSize,
  CARD_SIZES,
} from './card-size-honesty.js';

describe('L3 wave170 card-size catalog honesty', () => {
  it('size catalog boards', () => {
    expect(CARD_SIZES).toEqual(['portrait', 'landscape']);
    expect(cardSizeCatalogBoardCard()).toEqual({ sizes: 2, hasPortrait: 1, hasLandscape: 1 });
    expect(cardSizeCatalogStatusLine()).toBe('sizes=2 portrait=1 landscape=1');
    expect(cardSizeCatalogStatusLineMatches()).toBe(true);
    expect(cardSizeCatalogStatusLineConsistent(cardSizeCatalogStatusLine())).toBe(true);
    expect(cardSizeCatalogExportText().startsWith(cardSizeCatalogExportHeader())).toBe(true);
    expect(cardSizeCatalogExportLines()).toEqual([...CARD_SIZES]);
    expect(isDeclaredCardSize('portrait')).toBe(true);
    expect(isDeclaredCardSize('square')).toBe(false);
    expect(parseCardSizeCatalogStatusLine('nope')).toBeNull();
  });
});
