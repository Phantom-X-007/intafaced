import { describe, expect, it } from 'vitest';
import {
  kbErrorCatalogBoardCard,
  kbErrorCatalogStatusLine,
  parseKbErrorCatalogStatusLine,
  kbErrorCatalogStatusLineMatches,
  kbErrorCatalogStatusLineConsistent,
  kbErrorCatalogExportHeader,
  kbErrorCatalogExportLines,
  kbErrorCatalogExportText,
  isDeclaredKbErrorCode,
  KB_CATALOG_ERROR_CODES,
} from './kb-error-honesty.js';

describe('L3 wave140 KB error catalog honesty', () => {
  it('error code catalog boards', () => {
    expect(KB_CATALOG_ERROR_CODES).toHaveLength(2);
    expect(kbErrorCatalogBoardCard()).toEqual({
      codes: 2,
      hasInvalid: 1,
      hasVendorName: 1,
    });
    expect(kbErrorCatalogStatusLine()).toBe('codes=2 invalid=1 vendor_name=1');
    expect(kbErrorCatalogStatusLineMatches()).toBe(true);
    expect(kbErrorCatalogStatusLineConsistent(kbErrorCatalogStatusLine())).toBe(true);
    expect(kbErrorCatalogExportText().startsWith(kbErrorCatalogExportHeader())).toBe(true);
    expect(kbErrorCatalogExportLines()).toEqual([...KB_CATALOG_ERROR_CODES]);
    expect(isDeclaredKbErrorCode('support.kb_vendor_name')).toBe(true);
    expect(isDeclaredKbErrorCode('support.kb_ok')).toBe(false);
    expect(parseKbErrorCatalogStatusLine('nope')).toBeNull();
  });
});
