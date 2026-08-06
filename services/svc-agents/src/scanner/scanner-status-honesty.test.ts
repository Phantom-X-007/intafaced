import { describe, expect, it } from 'vitest';
import {
  scannerStatusCatalogBoardCard,
  scannerStatusCatalogStatusLine,
  parseScannerStatusCatalogStatusLine,
  scannerStatusCatalogStatusLineMatches,
  scannerStatusCatalogStatusLineConsistent,
  scannerStatusCatalogExportHeader,
  scannerStatusCatalogExportLines,
  scannerStatusCatalogExportText,
  isDeclaredScannerStatus,
  isDeclaredScannerUnavailableReason,
  SCANNER_RESULT_STATUSES,
  SCANNER_UNAVAILABLE_REASONS,
} from './scanner-status-honesty.js';

describe('L3 wave127 scanner status catalog honesty', () => {
  it('status and unavailable reason catalogs', () => {
    expect(SCANNER_RESULT_STATUSES).toEqual(['ok', 'empty', 'unavailable']);
    expect(SCANNER_UNAVAILABLE_REASONS).toEqual(['stale', 'no_quotes', 'invalid']);
    expect(scannerStatusCatalogBoardCard()).toEqual({
      statuses: 3,
      unavailableReasons: 3,
      inventsMarkets: 0,
    });
    expect(scannerStatusCatalogStatusLine()).toBe(
      'statuses=3 unavailable_reasons=3 invent=0',
    );
    expect(scannerStatusCatalogStatusLineMatches()).toBe(true);
    expect(scannerStatusCatalogStatusLineConsistent(scannerStatusCatalogStatusLine())).toBe(true);
    expect(scannerStatusCatalogExportText().startsWith(scannerStatusCatalogExportHeader())).toBe(
      true,
    );
    expect(scannerStatusCatalogExportLines()).toContain('unavailable:stale');
    expect(isDeclaredScannerStatus('empty')).toBe(true);
    expect(isDeclaredScannerStatus('green')).toBe(false);
    expect(isDeclaredScannerUnavailableReason('no_quotes')).toBe(true);
    expect(parseScannerStatusCatalogStatusLine('nope')).toBeNull();
  });
});
