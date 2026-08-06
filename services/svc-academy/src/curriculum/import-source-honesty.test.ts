import { describe, expect, it } from 'vitest';
import {
  importSourceCatalogBoardCard,
  importSourceCatalogStatusLine,
  parseImportSourceCatalogStatusLine,
  importSourceCatalogStatusLineMatches,
  importSourceCatalogStatusLineConsistent,
  importIssueCodeCatalogBoardCard,
  importIssueCodeCatalogStatusLine,
  parseImportIssueCodeCatalogStatusLine,
  importIssueCodeCatalogStatusLineMatches,
  importIssueCodeCatalogStatusLineConsistent,
  importSourceCatalogExportHeader,
  importSourceCatalogExportText,
  isDeclaredImportSource,
  isDeclaredImportIssueCode,
  CURRICULUM_CONTENT_SOURCES,
  IMPORT_ISSUE_CODES,
} from './import-source-honesty.js';

describe('L3 wave116 import source honesty', () => {
  it('source and issue code catalogs', () => {
    expect(CURRICULUM_CONTENT_SOURCES).toHaveLength(2);
    expect(IMPORT_ISSUE_CODES).toEqual(['missing', 'invalid', 'brand', 'path']);
    expect(importSourceCatalogBoardCard()).toEqual({
      sources: 2,
      hasPlatformNative: 1,
      hasLicensedPending: 1,
    });
    expect(importSourceCatalogStatusLineMatches()).toBe(true);
    expect(importSourceCatalogStatusLineConsistent(importSourceCatalogStatusLine())).toBe(true);
    expect(importSourceCatalogExportText().startsWith(importSourceCatalogExportHeader())).toBe(true);
    expect(isDeclaredImportSource('platform-native-expansion')).toBe(true);
    expect(isDeclaredImportSource('deriv-desk-import')).toBe(false);

    expect(importIssueCodeCatalogBoardCard()).toEqual({
      codes: 4,
      hasBrand: 1,
      hasPath: 1,
    });
    expect(importIssueCodeCatalogStatusLineMatches()).toBe(true);
    expect(importIssueCodeCatalogStatusLineConsistent(importIssueCodeCatalogStatusLine())).toBe(true);
    expect(isDeclaredImportIssueCode('brand')).toBe(true);
    expect(isDeclaredImportIssueCode('vendor')).toBe(false);
    expect(parseImportSourceCatalogStatusLine('nope')).toBeNull();
    expect(parseImportIssueCodeCatalogStatusLine('nope')).toBeNull();
  });
});
