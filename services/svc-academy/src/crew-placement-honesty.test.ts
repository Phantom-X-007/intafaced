import { describe, expect, it } from 'vitest';
import {
  placementCount,
  uniquePlacementCrewIds,
  uniqueMatchRunIds,
  placementBoardCard,
  placementStatusLine,
  parsePlacementStatusLine,
  placementStatusLineMatches,
  placementStatusLineConsistent,
  placementExportHeader,
  placementExportLine,
  placementExportText,
  placementListEmpty,
  placementCountInRange,
  type CrewPlacementInput,
} from './crew-placement-honesty.js';

describe('L3 wave71 academy crew placement honesty', () => {
  it('empty and mixed placement boards', () => {
    const empty: readonly CrewPlacementInput[] = [];
    expect(placementCount(empty)).toBe(0);
    expect(placementListEmpty(empty)).toBe(true);
    expect(placementStatusLineMatches(empty)).toBe(true);
    expect(placementStatusLineConsistent(placementStatusLine(empty))).toBe(true);
    expect(parsePlacementStatusLine('nope')).toBeNull();

    const mixed: readonly CrewPlacementInput[] = [
      { crewId: 'c1', userId: 'u1', role: 'lead', crewSize: 3, matchRunId: 'm1' },
      { crewId: 'c1', userId: 'u2', role: 'member', crewSize: 3, matchRunId: 'm1' },
      { crewId: 'c2', userId: 'u3', role: 'member', crewSize: 2, matchRunId: 'm2' },
    ];
    expect(placementCount(mixed)).toBe(3);
    expect(uniquePlacementCrewIds(mixed)).toEqual(['c1', 'c2']);
    expect(uniqueMatchRunIds(mixed)).toEqual(['m1', 'm2']);
    expect(placementBoardCard(mixed)).toEqual({
      placements: 3,
      crews: 2,
      users: 3,
      matchRuns: 2,
      totalCrewSize: 8,
    });
    expect(placementStatusLine(mixed)).toBe(
      'placements=3 crews=2 users=3 match_runs=2 crew_size_sum=8',
    );
    expect(placementStatusLineMatches(mixed)).toBe(true);
    expect(placementStatusLineConsistent(placementStatusLine(mixed))).toBe(true);
    expect(placementExportText(mixed).startsWith(placementExportHeader())).toBe(true);
    expect(placementExportLine(mixed)).toBe('3,2,3,2,8');
    expect(placementListEmpty(mixed)).toBe(false);
    expect(placementCountInRange(mixed, 3, 3)).toBe(true);
    expect(placementCountInRange(mixed, 4, 1)).toBe(false);
  });
});
