import { describe, expect, it } from 'vitest';
import {
  cardTierCatalogBoardCard,
  cardTierCatalogStatusLine,
  parseCardTierCatalogStatusLine,
  cardTierCatalogStatusLineMatches,
  cardTierCatalogStatusLineConsistent,
  cardTierCatalogExportHeader,
  cardTierCatalogExportLines,
  cardTierCatalogExportText,
  isDeclaredCardTierOnly,
  CARD_TIERS_ONLY,
} from './card-tier-honesty.js';

describe('L3 wave142 card tier catalog honesty', () => {
  it('card tier catalog boards', () => {
    expect(CARD_TIERS_ONLY).toHaveLength(4);
    expect(cardTierCatalogBoardCard()).toEqual({
      tiers: 4,
      hasNone: 1,
      hasObsidian: 1,
    });
    expect(cardTierCatalogStatusLine()).toBe('tiers=4 none=1 obsidian=1');
    expect(cardTierCatalogStatusLineMatches()).toBe(true);
    expect(cardTierCatalogStatusLineConsistent(cardTierCatalogStatusLine())).toBe(true);
    expect(cardTierCatalogExportText().startsWith(cardTierCatalogExportHeader())).toBe(true);
    expect(cardTierCatalogExportLines()).toEqual([...CARD_TIERS_ONLY]);
    expect(isDeclaredCardTierOnly('metal')).toBe(true);
    expect(isDeclaredCardTierOnly('gold')).toBe(false);
    expect(parseCardTierCatalogStatusLine('nope')).toBeNull();
  });
});
