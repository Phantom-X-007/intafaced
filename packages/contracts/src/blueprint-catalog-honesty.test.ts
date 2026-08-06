import { describe, expect, it } from 'vitest';
import {
  blueprintCatalogBoardCard,
  blueprintCatalogStatusLine,
  parseBlueprintCatalogStatusLine,
  blueprintCatalogStatusLineMatches,
  blueprintCatalogStatusLineConsistent,
  blueprintCatalogExportHeader,
  blueprintCatalogExportLine,
  blueprintCatalogExportText,
  isDeclaredCrewRole,
  isDeclaredVisibility,
  DECISION_STYLES,
  CREW_ROLES,
} from './blueprint-catalog-honesty.js';

describe('L3 wave92 blueprint catalog honesty', () => {
  it('enum catalog boards', () => {
    expect(DECISION_STYLES).toHaveLength(4);
    expect(CREW_ROLES).toHaveLength(4);
    expect(blueprintCatalogBoardCard()).toEqual({
      decisionStyles: 4,
      riskTemperaments: 4,
      energyRhythms: 4,
      learningModes: 4,
      crewRoles: 4,
      visibilities: 3,
      cardSizes: 2,
    });
    expect(blueprintCatalogStatusLine()).toBe(
      'decision=4 risk=4 energy=4 learning=4 crew=4 visibility=3 card=2',
    );
    expect(blueprintCatalogStatusLineMatches()).toBe(true);
    expect(blueprintCatalogStatusLineConsistent(blueprintCatalogStatusLine())).toBe(true);
    expect(blueprintCatalogExportText().startsWith(blueprintCatalogExportHeader())).toBe(true);
    expect(blueprintCatalogExportLine()).toBe('4,4,4,4,4,3,2');
    expect(isDeclaredCrewRole('anchor')).toBe(true);
    expect(isDeclaredCrewRole('ghost')).toBe(false);
    expect(isDeclaredVisibility('private')).toBe(true);
    expect(isDeclaredVisibility('world')).toBe(false);
    expect(parseBlueprintCatalogStatusLine('nope')).toBeNull();
  });
});
