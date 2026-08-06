import { describe, expect, it } from 'vitest';
import {
  certErrorCatalogBoardCard,
  certErrorCatalogStatusLine,
  parseCertErrorCatalogStatusLine,
  certErrorCatalogStatusLineMatches,
  certErrorCatalogStatusLineConsistent,
  certErrorCatalogExportHeader,
  certErrorCatalogExportLines,
  certErrorCatalogExportText,
  isDeclaredCertErrorCode,
  CERT_ERROR_CODES,
} from './cert-error-honesty.js';

describe('L3 wave131 cert error catalog honesty', () => {
  it('error code catalog boards', () => {
    expect(CERT_ERROR_CODES).toHaveLength(4);
    expect(certErrorCatalogBoardCard()).toEqual({
      codes: 4,
      hasIncomplete: 1,
      hasAlreadyGranted: 1,
      hasXpCode: 0,
    });
    expect(certErrorCatalogStatusLine()).toBe('codes=4 incomplete=1 already_granted=1 xp=0');
    expect(certErrorCatalogStatusLineMatches()).toBe(true);
    expect(certErrorCatalogStatusLineConsistent(certErrorCatalogStatusLine())).toBe(true);
    expect(certErrorCatalogExportText().startsWith(certErrorCatalogExportHeader())).toBe(true);
    expect(certErrorCatalogExportLines()).toEqual([...CERT_ERROR_CODES]);
    expect(isDeclaredCertErrorCode('academy.cert_not_found')).toBe(true);
    expect(isDeclaredCertErrorCode('academy.cert_xp_fail')).toBe(false);
    expect(parseCertErrorCatalogStatusLine('nope')).toBeNull();
  });
});
