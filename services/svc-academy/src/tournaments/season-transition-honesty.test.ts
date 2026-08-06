import { describe, expect, it } from 'vitest';
import {
  seasonTransitionCatalogBoardCard,
  seasonTransitionCatalogStatusLine,
  parseSeasonTransitionCatalogStatusLine,
  seasonTransitionCatalogStatusLineMatches,
  seasonTransitionCatalogStatusLineConsistent,
  seasonTransitionCatalogExportHeader,
  seasonTransitionCatalogExportLine,
  seasonTransitionCatalogExportText,
  isAllowedSeasonTransition,
  allowedNextCount,
  seasonTransitionEdgeCount,
  seasonScoreWritable,
  seasonMayFreeze,
  SEASON_STATUSES,
} from './season-transition-honesty.js';

describe('L3 wave95 season transition honesty', () => {
  it('graph catalog and edges', () => {
    expect(SEASON_STATUSES).toHaveLength(4);
    expect(allowedNextCount('ended')).toBe(0);
    expect(allowedNextCount('scheduled')).toBe(2);
    expect(seasonTransitionEdgeCount()).toBe(6);
    expect(isAllowedSeasonTransition('scheduled', 'live')).toBe(true);
    expect(isAllowedSeasonTransition('ended', 'live')).toBe(false);
    expect(seasonScoreWritable('live')).toBe(true);
    expect(seasonScoreWritable('frozen')).toBe(false);
    expect(seasonMayFreeze('live')).toBe(true);
    expect(seasonMayFreeze('scheduled')).toBe(false);
    expect(seasonTransitionCatalogBoardCard()).toEqual({
      statuses: 4,
      edges: 6,
      terminalEdges: 0,
      scheduledEdges: 2,
    });
    expect(seasonTransitionCatalogStatusLineMatches()).toBe(true);
    expect(seasonTransitionCatalogStatusLineConsistent(seasonTransitionCatalogStatusLine())).toBe(
      true,
    );
    expect(seasonTransitionCatalogExportText().startsWith(seasonTransitionCatalogExportHeader())).toBe(
      true,
    );
    expect(seasonTransitionCatalogExportLine()).toBe('4,6,0,2');
    expect(parseSeasonTransitionCatalogStatusLine('nope')).toBeNull();
  });
});
