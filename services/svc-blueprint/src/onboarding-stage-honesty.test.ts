import { describe, expect, it } from 'vitest';
import {
  onboardingStageCatalogBoardCard,
  onboardingStageCatalogStatusLine,
  parseOnboardingStageCatalogStatusLine,
  onboardingStageCatalogStatusLineMatches,
  onboardingStageCatalogStatusLineConsistent,
  onboardingStageCatalogExportHeader,
  onboardingStageCatalogExportLines,
  onboardingStageCatalogExportText,
  isDeclaredOnboardingStage,
  ONBOARDING_STAGES,
} from './onboarding-stage-honesty.js';

describe('L3 wave180 onboarding-stage catalog honesty', () => {
  it('onboarding stage catalog boards', () => {
    expect(ONBOARDING_STAGES).toEqual(['session', 'engine', 'persist', 'match', 'mentors', 'card', 'export', 'erase']);
    expect(onboardingStageCatalogBoardCard()).toEqual({
      stages: 8,
      hasSession: 1,
      hasEngine: 1,
      hasErase: 1,
      hasExport: 1,
    });
    expect(onboardingStageCatalogStatusLine()).toBe('stages=8 session=1 engine=1 erase=1 export=1');
    expect(onboardingStageCatalogStatusLineMatches()).toBe(true);
    expect(onboardingStageCatalogStatusLineConsistent(onboardingStageCatalogStatusLine())).toBe(true);
    expect(onboardingStageCatalogExportText().startsWith(onboardingStageCatalogExportHeader())).toBe(true);
    expect(onboardingStageCatalogExportLines()).toEqual([...ONBOARDING_STAGES]);
    expect(isDeclaredOnboardingStage('erase')).toBe(true);
    expect(isDeclaredOnboardingStage('billing')).toBe(false);
    expect(parseOnboardingStageCatalogStatusLine('nope')).toBeNull();
  });
});
