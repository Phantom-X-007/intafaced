import { describe, expect, it } from 'vitest';
import {
  crewChannelCount,
  uniqueCrewIds,
  uniqueCrewUserIds,
  crewRoleHistogram,
  crewChannelBoardCard,
  crewChannelStatusLine,
  parseCrewChannelStatusLine,
  crewChannelStatusLineMatches,
  crewChannelStatusLineConsistent,
  crewChannelExportHeader,
  crewChannelExportLine,
  crewChannelExportText,
  crewChannelListEmpty,
  crewChannelCountInRange,
  crewHasId,
  type CrewChannelInput,
} from './crew-honesty.js';

describe('L3 wave69 crew channel honesty', () => {
  it('empty and mixed channel boards', () => {
    const empty: readonly CrewChannelInput[] = [];
    expect(crewChannelCount(empty)).toBe(0);
    expect(crewChannelListEmpty(empty)).toBe(true);
    expect(crewChannelStatusLineMatches(empty)).toBe(true);
    expect(crewChannelStatusLineConsistent(crewChannelStatusLine(empty))).toBe(true);
    expect(parseCrewChannelStatusLine('nope')).toBeNull();

    const mixed: readonly CrewChannelInput[] = [
      { crewId: 'c1', userId: 'u1', role: 'lead' },
      { crewId: 'c1', userId: 'u2', role: 'member' },
      { crewId: 'c2', userId: 'u1', role: 'member' },
    ];
    expect(crewChannelCount(mixed)).toBe(3);
    expect(uniqueCrewIds(mixed)).toEqual(['c1', 'c2']);
    expect(uniqueCrewUserIds(mixed)).toEqual(['u1', 'u2']);
    expect(crewRoleHistogram(mixed)).toEqual({ lead: 1, member: 2 });
    expect(crewChannelBoardCard(mixed)).toEqual({ channels: 3, crews: 2, users: 2, roles: 2 });
    expect(crewChannelStatusLine(mixed)).toBe('channels=3 crews=2 users=2 roles=2');
    expect(crewChannelStatusLineMatches(mixed)).toBe(true);
    expect(crewChannelStatusLineConsistent(crewChannelStatusLine(mixed))).toBe(true);
    expect(crewChannelExportText(mixed).startsWith(crewChannelExportHeader())).toBe(true);
    expect(crewChannelExportLine(mixed)).toBe('3,2,2,2');
    expect(crewChannelListEmpty(mixed)).toBe(false);
    expect(crewChannelCountInRange(mixed, 3, 3)).toBe(true);
    expect(crewChannelCountInRange(mixed, 4, 1)).toBe(false);
    expect(crewHasId(mixed, 'c1')).toBe(true);
    expect(crewHasId(mixed, 'c9')).toBe(false);
  });
});
