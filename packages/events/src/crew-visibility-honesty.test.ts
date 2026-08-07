import { describe, expect, it } from 'vitest';
import {
  crewVisibilityCatalogBoardCard,
  crewVisibilityCatalogStatusLine,
  parseCrewVisibilityCatalogStatusLine,
  crewVisibilityCatalogStatusLineMatches,
  crewVisibilityCatalogStatusLineConsistent,
  crewVisibilityCatalogExportHeader,
  crewVisibilityCatalogExportLines,
  crewVisibilityCatalogExportText,
  isDeclaredCrewVisibility,
  CREW_VISIBILITIES,
} from './crew-visibility-honesty.js';

describe('L3 wave224 crew-visibility catalog honesty', () => {
  it('crew visibility catalog boards', () => {
    expect(CREW_VISIBILITIES).toEqual(['private', 'crew', 'public']);
    expect(crewVisibilityCatalogBoardCard()).toEqual({
      visibilities: 3,
      hasPrivate: 1,
      hasCrew: 1,
      hasPublic: 1,
    });
    expect(crewVisibilityCatalogStatusLine()).toBe('visibilities=3 private=1 crew=1 public=1');
    expect(crewVisibilityCatalogStatusLineMatches()).toBe(true);
    expect(crewVisibilityCatalogStatusLineConsistent(crewVisibilityCatalogStatusLine())).toBe(true);
    expect(crewVisibilityCatalogExportText().startsWith(crewVisibilityCatalogExportHeader())).toBe(true);
    expect(crewVisibilityCatalogExportLines()).toEqual([...CREW_VISIBILITIES]);
    expect(isDeclaredCrewVisibility('crew')).toBe(true);
    expect(isDeclaredCrewVisibility('friends')).toBe(false);
    expect(parseCrewVisibilityCatalogStatusLine('nope')).toBeNull();
  });
});
