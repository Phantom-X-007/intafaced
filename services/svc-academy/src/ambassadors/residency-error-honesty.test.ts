import { describe, expect, it } from 'vitest';
import {
  residencyErrorCatalogBoardCard,
  residencyErrorCatalogStatusLine,
  parseResidencyErrorCatalogStatusLine,
  residencyErrorCatalogStatusLineMatches,
  residencyErrorCatalogStatusLineConsistent,
  residencyErrorCatalogExportHeader,
  residencyErrorCatalogExportLines,
  residencyErrorCatalogExportText,
  isDeclaredResidencyErrorCode,
  RESIDENCY_ERROR_CODES,
} from './residency-error-honesty.js';

describe('L3 wave125 residency error catalog honesty', () => {
  it('error code catalog boards', () => {
    expect(RESIDENCY_ERROR_CODES).toHaveLength(4);
    expect(residencyErrorCatalogBoardCard()).toEqual({
      codes: 4,
      hasInvalid: 1,
      hasNotFound: 1,
      hasAlreadyOpen: 1,
    });
    expect(residencyErrorCatalogStatusLine()).toBe('codes=4 invalid=1 not_found=1 already_open=1');
    expect(residencyErrorCatalogStatusLineMatches()).toBe(true);
    expect(residencyErrorCatalogStatusLineConsistent(residencyErrorCatalogStatusLine())).toBe(true);
    expect(residencyErrorCatalogExportText().startsWith(residencyErrorCatalogExportHeader())).toBe(true);
    expect(residencyErrorCatalogExportLines()).toEqual([...RESIDENCY_ERROR_CODES]);
    expect(isDeclaredResidencyErrorCode('academy.residency_not_pending')).toBe(true);
    expect(isDeclaredResidencyErrorCode('academy.residency_paid')).toBe(false);
    expect(parseResidencyErrorCatalogStatusLine('nope')).toBeNull();
  });
});
