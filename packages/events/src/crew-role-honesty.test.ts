import { describe, expect, it } from 'vitest';
import {
  crewRoleCatalogBoardCard,
  crewRoleCatalogStatusLine,
  parseCrewRoleCatalogStatusLine,
  crewRoleCatalogStatusLineMatches,
  crewRoleCatalogStatusLineConsistent,
  crewRoleCatalogExportHeader,
  crewRoleCatalogExportLines,
  crewRoleCatalogExportText,
  isDeclaredCrewRole,
  CREW_ROLES,
} from './crew-role-honesty.js';

describe('L3 wave216 crew-role catalog honesty', () => {
  it('crew role catalog boards', () => {
    expect(CREW_ROLES).toEqual(['anchor', 'scout', 'builder', 'catalyst']);
    expect(crewRoleCatalogBoardCard()).toEqual({
      roles: 4,
      hasAnchor: 1,
      hasScout: 1,
      hasBuilder: 1,
      hasCatalyst: 1,
    });
    expect(crewRoleCatalogStatusLine()).toBe('roles=4 anchor=1 scout=1 builder=1 catalyst=1');
    expect(crewRoleCatalogStatusLineMatches()).toBe(true);
    expect(crewRoleCatalogStatusLineConsistent(crewRoleCatalogStatusLine())).toBe(true);
    expect(crewRoleCatalogExportText().startsWith(crewRoleCatalogExportHeader())).toBe(true);
    expect(crewRoleCatalogExportLines()).toEqual([...CREW_ROLES]);
    expect(isDeclaredCrewRole('scout')).toBe(true);
    expect(isDeclaredCrewRole('leader')).toBe(false);
    expect(parseCrewRoleCatalogStatusLine('nope')).toBeNull();
  });
});
