import { describe, expect, it } from 'vitest';
import {
  marginModeCatalogBoardCard,
  marginModeCatalogStatusLine,
  parseMarginModeCatalogStatusLine,
  marginModeCatalogStatusLineMatches,
  marginModeCatalogStatusLineConsistent,
  marginModeCatalogExportHeader,
  marginModeCatalogExportLines,
  marginModeCatalogExportText,
  isDeclaredMarginMode,
  MARGIN_MODES,
} from './margin-mode-honesty.js';

describe('L3 wave204 margin-mode catalog honesty', () => {
  it('margin mode catalog boards', () => {
    expect(MARGIN_MODES).toEqual(['cross', 'isolated']);
    expect(marginModeCatalogBoardCard()).toEqual({
      modes: 2,
      hasCross: 1,
      hasIsolated: 1,
    });
    expect(marginModeCatalogStatusLine()).toBe('modes=2 cross=1 isolated=1');
    expect(marginModeCatalogStatusLineMatches()).toBe(true);
    expect(marginModeCatalogStatusLineConsistent(marginModeCatalogStatusLine())).toBe(true);
    expect(marginModeCatalogExportText().startsWith(marginModeCatalogExportHeader())).toBe(true);
    expect(marginModeCatalogExportLines()).toEqual([...MARGIN_MODES]);
    expect(isDeclaredMarginMode('isolated')).toBe(true);
    expect(isDeclaredMarginMode('portfolio')).toBe(false);
    expect(parseMarginModeCatalogStatusLine('nope')).toBeNull();
  });
});
