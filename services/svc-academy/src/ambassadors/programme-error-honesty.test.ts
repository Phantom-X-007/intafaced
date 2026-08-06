import { describe, expect, it } from 'vitest';
import {
  programmeErrorCatalogBoardCard,
  programmeErrorCatalogStatusLine,
  parseProgrammeErrorCatalogStatusLine,
  programmeErrorCatalogStatusLineMatches,
  programmeErrorCatalogStatusLineConsistent,
  programmeErrorCatalogExportHeader,
  programmeErrorCatalogExportLines,
  programmeErrorCatalogExportText,
  isDeclaredProgrammeErrorCode,
  AMBASSADOR_PROGRAMME_ERROR_CODES,
} from './programme-error-honesty.js';

describe('L3 wave128 programme error catalog honesty', () => {
  it('error code catalog boards', () => {
    expect(AMBASSADOR_PROGRAMME_ERROR_CODES).toHaveLength(4);
    expect(programmeErrorCatalogBoardCard()).toEqual({
      codes: 4,
      hasNotFound: 1,
      hasAlreadyActive: 1,
      hasPayCode: 0,
    });
    expect(programmeErrorCatalogStatusLine()).toBe(
      'codes=4 not_found=1 already_active=1 pay=0',
    );
    expect(programmeErrorCatalogStatusLineMatches()).toBe(true);
    expect(programmeErrorCatalogStatusLineConsistent(programmeErrorCatalogStatusLine())).toBe(true);
    expect(programmeErrorCatalogExportText().startsWith(programmeErrorCatalogExportHeader())).toBe(
      true,
    );
    expect(programmeErrorCatalogExportLines()).toEqual([...AMBASSADOR_PROGRAMME_ERROR_CODES]);
    expect(isDeclaredProgrammeErrorCode('academy.ambassador_already_frozen')).toBe(true);
    expect(isDeclaredProgrammeErrorCode('academy.ambassador_payout')).toBe(false);
    expect(parseProgrammeErrorCatalogStatusLine('nope')).toBeNull();
  });
});
