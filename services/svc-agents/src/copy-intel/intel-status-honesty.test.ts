import { describe, expect, it } from 'vitest';
import {
  intelStatusCatalogBoardCard,
  intelStatusCatalogStatusLine,
  parseIntelStatusCatalogStatusLine,
  intelStatusCatalogStatusLineMatches,
  intelStatusCatalogStatusLineConsistent,
  intelStatusCatalogExportHeader,
  intelStatusCatalogExportLines,
  intelStatusCatalogExportText,
  isDeclaredIntelStatus,
  isDeclaredIntelUnavailableReason,
  INTEL_RESULT_STATUSES,
  INTEL_UNAVAILABLE_REASONS,
} from './intel-status-honesty.js';

describe('L3 wave139 copy-intel status catalog honesty', () => {
  it('status and unavailable reason catalogs', () => {
    expect(INTEL_RESULT_STATUSES).toEqual(['ok', 'empty', 'unavailable']);
    expect(INTEL_UNAVAILABLE_REASONS).toEqual(['no_data', 'invalid_window', 'copy_plane_dark']);
    expect(intelStatusCatalogBoardCard()).toEqual({
      statuses: 3,
      unavailableReasons: 3,
      inventsPnl: 0,
    });
    expect(intelStatusCatalogStatusLine()).toBe(
      'statuses=3 unavailable_reasons=3 invent_pnl=0',
    );
    expect(intelStatusCatalogStatusLineMatches()).toBe(true);
    expect(intelStatusCatalogStatusLineConsistent(intelStatusCatalogStatusLine())).toBe(true);
    expect(intelStatusCatalogExportText().startsWith(intelStatusCatalogExportHeader())).toBe(true);
    expect(intelStatusCatalogExportLines()).toContain('unavailable:copy_plane_dark');
    expect(isDeclaredIntelStatus('empty')).toBe(true);
    expect(isDeclaredIntelStatus('green')).toBe(false);
    expect(isDeclaredIntelUnavailableReason('no_data')).toBe(true);
    expect(parseIntelStatusCatalogStatusLine('nope')).toBeNull();
  });
});
