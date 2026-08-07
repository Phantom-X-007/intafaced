import { describe, expect, it } from 'vitest';
import {
  appEnvCatalogBoardCard,
  appEnvCatalogStatusLine,
  parseAppEnvCatalogStatusLine,
  appEnvCatalogStatusLineMatches,
  appEnvCatalogStatusLineConsistent,
  appEnvCatalogExportHeader,
  appEnvCatalogExportLines,
  appEnvCatalogExportText,
  isDeclaredAppEnv,
  APP_ENVS,
} from './app-env-honesty.js';

describe('L3 wave209 app-env catalog honesty', () => {
  it('app env catalog boards', () => {
    expect(APP_ENVS).toEqual(['dev', 'test', 'staging', 'prod']);
    expect(appEnvCatalogBoardCard()).toEqual({
      envs: 4,
      hasDev: 1,
      hasStaging: 1,
      hasProd: 1,
      hasTest: 1,
    });
    expect(appEnvCatalogStatusLine()).toBe('envs=4 dev=1 test=1 staging=1 prod=1');
    expect(appEnvCatalogStatusLineMatches()).toBe(true);
    expect(appEnvCatalogStatusLineConsistent(appEnvCatalogStatusLine())).toBe(true);
    expect(appEnvCatalogExportText().startsWith(appEnvCatalogExportHeader())).toBe(true);
    expect(appEnvCatalogExportLines()).toEqual([...APP_ENVS]);
    expect(isDeclaredAppEnv('prod')).toBe(true);
    expect(isDeclaredAppEnv('local')).toBe(false);
    expect(parseAppEnvCatalogStatusLine('nope')).toBeNull();
  });
});
