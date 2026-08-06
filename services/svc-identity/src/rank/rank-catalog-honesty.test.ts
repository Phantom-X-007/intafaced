import { describe, expect, it } from 'vitest';
import {
  rankTierCount,
  hostRightsTierCount,
  otcAccessTierCount,
  cardTierHistogram,
  rankCatalogBoardCard,
  rankCatalogStatusLine,
  parseRankCatalogStatusLine,
  rankCatalogStatusLineMatches,
  rankCatalogStatusLineConsistent,
  rankCatalogExportHeader,
  rankCatalogExportLine,
  rankCatalogExportText,
  rankTitles,
  rankHasTitle,
  rankTierCountInRange,
  type RankTierBoardInput,
} from './rank-catalog-honesty.js';

describe('L3 wave72 rank catalog honesty', () => {
  it('empty and sample ladder boards', () => {
    const empty: readonly RankTierBoardInput[] = [];
    expect(rankTierCount(empty)).toBe(0);
    expect(rankCatalogBoardCard(empty).maxRank).toBe(-1);
    expect(rankCatalogStatusLineMatches(empty)).toBe(true);
    expect(rankCatalogStatusLineConsistent(rankCatalogStatusLine(empty))).toBe(true);
    expect(parseRankCatalogStatusLine('nope')).toBeNull();

    const sample: readonly RankTierBoardInput[] = [
      {
        rank: 0,
        xpRequired: '0',
        title: 'Initiate',
        lobbyHostRights: false,
        otcAccess: false,
        cardTier: 'none',
      },
      {
        rank: 4,
        xpRequired: '10000',
        title: 'Broker',
        lobbyHostRights: true,
        otcAccess: false,
        cardTier: 'standard',
      },
      {
        rank: 6,
        xpRequired: '60000',
        title: 'Principal',
        lobbyHostRights: true,
        otcAccess: true,
        cardTier: 'metal',
      },
    ];
    expect(rankTierCount(sample)).toBe(3);
    expect(hostRightsTierCount(sample)).toBe(2);
    expect(otcAccessTierCount(sample)).toBe(1);
    expect(cardTierHistogram(sample)).toEqual({ none: 1, standard: 1, metal: 1 });
    expect(rankCatalogBoardCard(sample)).toEqual({
      tiers: 3,
      hostRights: 2,
      otc: 1,
      maxRank: 6,
    });
    expect(rankCatalogStatusLine(sample)).toBe('tiers=3 host_rights=2 otc=1 max_rank=6');
    expect(rankCatalogStatusLineMatches(sample)).toBe(true);
    expect(rankCatalogStatusLineConsistent(rankCatalogStatusLine(sample))).toBe(true);
    expect(rankCatalogExportText(sample).startsWith(rankCatalogExportHeader())).toBe(true);
    expect(rankCatalogExportLine(sample)).toBe('3,2,1,6');
    expect(rankTitles(sample)).toEqual(['Initiate', 'Broker', 'Principal']);
    expect(rankHasTitle(sample, 'Broker')).toBe(true);
    expect(rankHasTitle(sample, 'Ghost')).toBe(false);
    expect(rankTierCountInRange(sample, 3, 3)).toBe(true);
    expect(rankTierCountInRange(sample, 4, 1)).toBe(false);
  });
});
