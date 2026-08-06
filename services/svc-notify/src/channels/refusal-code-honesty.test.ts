import { describe, expect, it } from 'vitest';
import { allRefusalCodes, refusalCodeCount } from './channel.js';
import {
  refusalCodeCatalogBoardCard,
  refusalCodeCatalogStatusLine,
  parseRefusalCodeCatalogStatusLine,
  refusalCodeCatalogStatusLineMatches,
  refusalCodeCatalogStatusLineConsistent,
  refusalCodeCatalogExportHeader,
  refusalCodeCatalogExportLines,
  refusalCodeCatalogExportText,
  isDeclaredRefusalCode,
  refusalCodeCountInRange,
} from './refusal-code-honesty.js';

describe('L3 wave114 refusal code catalog honesty', () => {
  it('catalog boards', () => {
    expect(refusalCodeCount()).toBe(allRefusalCodes().length);
    expect(allRefusalCodes().length).toBeGreaterThanOrEqual(5);
    expect(refusalCodeCatalogBoardCard().hasNotConfigured).toBe(1);
    expect(refusalCodeCatalogStatusLineMatches()).toBe(true);
    expect(refusalCodeCatalogStatusLineConsistent(refusalCodeCatalogStatusLine())).toBe(true);
    expect(refusalCodeCatalogExportText().startsWith(refusalCodeCatalogExportHeader())).toBe(true);
    expect(refusalCodeCatalogExportLines()).toEqual([...allRefusalCodes()]);
    expect(isDeclaredRefusalCode('channel.muted')).toBe(true);
    expect(isDeclaredRefusalCode('channel.invented')).toBe(false);
    expect(refusalCodeCountInRange(1, 20)).toBe(true);
    expect(parseRefusalCodeCatalogStatusLine('nope')).toBeNull();
  });
});
