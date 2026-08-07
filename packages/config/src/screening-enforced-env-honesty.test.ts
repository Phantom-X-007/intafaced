import { describe, expect, it } from 'vitest';
import {
  screeningEnforcedEnvCatalogBoardCard,
  screeningEnforcedEnvCatalogStatusLine,
  parseScreeningEnforcedEnvCatalogStatusLine,
  screeningEnforcedEnvCatalogStatusLineMatches,
  screeningEnforcedEnvCatalogStatusLineConsistent,
  screeningEnforcedEnvCatalogExportHeader,
  screeningEnforcedEnvCatalogExportLines,
  screeningEnforcedEnvCatalogExportText,
  isDeclaredScreeningEnforcedEnv,
  SCREENING_ENFORCED_ENVS,
} from './screening-enforced-env-honesty.js';

describe('L3 wave229 screening-enforced-env catalog honesty', () => {
  it('screening enforced env catalog boards', () => {
    expect(SCREENING_ENFORCED_ENVS).toEqual(['staging', 'prod']);
    expect(screeningEnforcedEnvCatalogBoardCard()).toEqual({
      envs: 2,
      hasStaging: 1,
      hasProd: 1,
    });
    expect(screeningEnforcedEnvCatalogStatusLine()).toBe('envs=2 staging=1 prod=1');
    expect(screeningEnforcedEnvCatalogStatusLineMatches()).toBe(true);
    expect(screeningEnforcedEnvCatalogStatusLineConsistent(screeningEnforcedEnvCatalogStatusLine())).toBe(true);
    expect(screeningEnforcedEnvCatalogExportText().startsWith(screeningEnforcedEnvCatalogExportHeader())).toBe(true);
    expect(screeningEnforcedEnvCatalogExportLines()).toEqual([...SCREENING_ENFORCED_ENVS]);
    expect(isDeclaredScreeningEnforcedEnv('prod')).toBe(true);
    expect(isDeclaredScreeningEnforcedEnv('dev')).toBe(false);
    expect(parseScreeningEnforcedEnvCatalogStatusLine('nope')).toBeNull();
  });
});
