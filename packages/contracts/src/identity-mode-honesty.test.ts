import { describe, expect, it } from 'vitest';
import {
  identityModeCatalogBoardCard,
  identityModeCatalogStatusLine,
  parseIdentityModeCatalogStatusLine,
  identityModeCatalogStatusLineMatches,
  identityModeCatalogStatusLineConsistent,
  identityModeCatalogExportHeader,
  identityModeCatalogExportLines,
  identityModeCatalogExportText,
  isDeclaredIdentityMode,
  IDENTITY_MODES,
} from './identity-mode-honesty.js';

describe('L3 wave159 identity mode catalog honesty', () => {
  it('mode catalog boards', () => {
    expect(IDENTITY_MODES).toEqual(['trader', 'merchant', 'creator', 'student']);
    expect(identityModeCatalogBoardCard()).toEqual({
      modes: 4,
      hasTrader: 1,
      hasMerchant: 1,
      hasCreator: 1,
      hasStudent: 1,
    });
    expect(identityModeCatalogStatusLine()).toBe('modes=4 trader=1 merchant=1 creator=1 student=1');
    expect(identityModeCatalogStatusLineMatches()).toBe(true);
    expect(identityModeCatalogStatusLineConsistent(identityModeCatalogStatusLine())).toBe(true);
    expect(identityModeCatalogExportText().startsWith(identityModeCatalogExportHeader())).toBe(true);
    expect(identityModeCatalogExportLines()).toEqual([...IDENTITY_MODES]);
    expect(isDeclaredIdentityMode('student')).toBe(true);
    expect(isDeclaredIdentityMode('admin')).toBe(false);
    expect(parseIdentityModeCatalogStatusLine('nope')).toBeNull();
  });
});
