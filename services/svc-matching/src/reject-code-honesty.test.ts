import { describe, expect, it } from 'vitest';
import {
  rejectCodeCatalogBoardCard,
  rejectCodeCatalogStatusLine,
  parseRejectCodeCatalogStatusLine,
  rejectCodeCatalogStatusLineMatches,
  rejectCodeCatalogStatusLineConsistent,
  rejectCodeCatalogExportHeader,
  rejectCodeCatalogExportLines,
  rejectCodeCatalogExportText,
  isDeclaredRejectCode,
  REJECT_CODES,
} from './reject-code-honesty.js';

describe('L3 wave191 reject-code catalog honesty', () => {
  it('reject code catalog boards', () => {
    expect(REJECT_CODES).toHaveLength(11);
    expect(REJECT_CODES).toContain('engine_disabled');
    expect(rejectCodeCatalogBoardCard()).toEqual({
      codes: 11,
      hasEngineDisabled: 1,
      hasFokUnfillable: 1,
      hasPostOnlyWouldCross: 1,
      hasDuplicate: 1,
    });
    expect(rejectCodeCatalogStatusLine()).toBe('codes=11 engine_disabled=1 fok_unfillable=1 post_only_cross=1 duplicate=1');
    expect(rejectCodeCatalogStatusLineMatches()).toBe(true);
    expect(rejectCodeCatalogStatusLineConsistent(rejectCodeCatalogStatusLine())).toBe(true);
    expect(rejectCodeCatalogExportText().startsWith(rejectCodeCatalogExportHeader())).toBe(true);
    expect(rejectCodeCatalogExportLines()).toEqual([...REJECT_CODES]);
    expect(isDeclaredRejectCode('fok_unfillable')).toBe(true);
    expect(isDeclaredRejectCode('not_a_code')).toBe(false);
    expect(parseRejectCodeCatalogStatusLine('nope')).toBeNull();
  });
});
