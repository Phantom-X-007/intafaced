import { describe, expect, it } from 'vitest';
import {
  seasonStatusCatalogBoardCard,
  seasonStatusCatalogStatusLine,
  parseSeasonStatusCatalogStatusLine,
  seasonStatusCatalogStatusLineMatches,
  seasonStatusCatalogStatusLineConsistent,
  seasonMayWriteScores,
  standingsBoardCard,
  standingsStatusLine,
  parseStandingsStatusLine,
  standingsStatusLineMatches,
  standingsStatusLineConsistent,
  standingsExportHeader,
  standingsExportLine,
  standingsExportText,
  standingsCountInRange,
  SEASON_STATUSES,
  type SeasonBoardInput,
} from './season-status-honesty.js';

describe('L3 wave89 season status honesty', () => {
  it('catalog and standings boards', () => {
    expect(SEASON_STATUSES).toHaveLength(4);
    expect(seasonStatusCatalogBoardCard()).toEqual({
      statuses: 4,
      mayWriteScoreWhenScheduled: 0,
      mayWriteScoreWhenEnded: 0,
    });
    expect(seasonStatusCatalogStatusLineMatches()).toBe(true);
    expect(seasonStatusCatalogStatusLineConsistent(seasonStatusCatalogStatusLine())).toBe(true);
    expect(seasonMayWriteScores('live')).toBe(true);
    expect(seasonMayWriteScores('scheduled')).toBe(false);
    expect(parseSeasonStatusCatalogStatusLine('nope')).toBeNull();

    const live: SeasonBoardInput = {
      status: 'live',
      standings: [
        { userId: 'u1', score: 100, rank: 1 },
        { userId: 'u2', score: 50, rank: 2 },
      ],
    };
    expect(standingsBoardCard(live)).toEqual({
      status: 'live',
      standings: 2,
      mayWrite: 1,
      topRank: 1,
    });
    expect(standingsStatusLine(live)).toBe('status=live standings=2 may_write=1 top_rank=1');
    expect(standingsStatusLineMatches(live)).toBe(true);
    expect(standingsStatusLineConsistent(standingsStatusLine(live))).toBe(true);
    expect(standingsExportText(live).startsWith(standingsExportHeader())).toBe(true);
    expect(standingsExportLine(live)).toBe('live,2,1,1');
    expect(standingsCountInRange(live, 2, 2)).toBe(true);

    const ended: SeasonBoardInput = { status: 'ended', standings: [] };
    expect(standingsBoardCard(ended).mayWrite).toBe(0);
    expect(standingsStatusLineMatches(ended)).toBe(true);
    expect(standingsStatusLineConsistent(standingsStatusLine(ended))).toBe(true);
    expect(parseStandingsStatusLine('nope')).toBeNull();
  });
});
