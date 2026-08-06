import { describe, expect, it } from 'vitest';
import {
  shareModeCatalogBoardCard,
  shareModeCatalogStatusLine,
  parseShareModeCatalogStatusLine,
  shareModeCatalogStatusLineMatches,
  shareModeCatalogStatusLineConsistent,
  shareModeCatalogExportHeader,
  shareModeCatalogExportLines,
  shareModeCatalogExportText,
  isDeclaredShareMode,
  SHARE_MODES,
} from './share-mode-honesty.js';

describe('L3 wave161 share-mode catalog honesty', () => {
  it('mode catalog boards', () => {
    expect(SHARE_MODES).toEqual(['svg', 'png']);
    expect(shareModeCatalogBoardCard()).toEqual({ modes: 2, hasSvg: 1, hasPng: 1 });
    expect(shareModeCatalogStatusLine()).toBe('modes=2 svg=1 png=1');
    expect(shareModeCatalogStatusLineMatches()).toBe(true);
    expect(shareModeCatalogStatusLineConsistent(shareModeCatalogStatusLine())).toBe(true);
    expect(shareModeCatalogExportText().startsWith(shareModeCatalogExportHeader())).toBe(true);
    expect(shareModeCatalogExportLines()).toEqual([...SHARE_MODES]);
    expect(isDeclaredShareMode('svg')).toBe(true);
    expect(isDeclaredShareMode('pdf')).toBe(false);
    expect(parseShareModeCatalogStatusLine('nope')).toBeNull();
  });
});
