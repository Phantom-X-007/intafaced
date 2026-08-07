import { describe, expect, it } from 'vitest';
import {
  restingKindCatalogBoardCard,
  restingKindCatalogStatusLine,
  parseRestingKindCatalogStatusLine,
  restingKindCatalogStatusLineMatches,
  restingKindCatalogStatusLineConsistent,
  restingKindCatalogExportHeader,
  restingKindCatalogExportLines,
  restingKindCatalogExportText,
  isDeclaredRestingKind,
  RESTING_KINDS,
} from './resting-kind-honesty.js';

describe('L3 wave196 resting-kind catalog honesty', () => {
  it('resting kind catalog boards', () => {
    expect(RESTING_KINDS).toEqual(['book', 'stop']);
    expect(restingKindCatalogBoardCard()).toEqual({
      kinds: 2,
      hasBook: 1,
      hasStop: 1,
    });
    expect(restingKindCatalogStatusLine()).toBe('kinds=2 book=1 stop=1');
    expect(restingKindCatalogStatusLineMatches()).toBe(true);
    expect(restingKindCatalogStatusLineConsistent(restingKindCatalogStatusLine())).toBe(true);
    expect(restingKindCatalogExportText().startsWith(restingKindCatalogExportHeader())).toBe(true);
    expect(restingKindCatalogExportLines()).toEqual([...RESTING_KINDS]);
    expect(isDeclaredRestingKind('book')).toBe(true);
    expect(isDeclaredRestingKind('parked')).toBe(false);
    expect(parseRestingKindCatalogStatusLine('nope')).toBeNull();
  });
});
