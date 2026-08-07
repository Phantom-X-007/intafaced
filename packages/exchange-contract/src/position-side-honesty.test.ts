import { describe, expect, it } from 'vitest';
import {
  positionSideCatalogBoardCard,
  positionSideCatalogStatusLine,
  parsePositionSideCatalogStatusLine,
  positionSideCatalogStatusLineMatches,
  positionSideCatalogStatusLineConsistent,
  positionSideCatalogExportHeader,
  positionSideCatalogExportLines,
  positionSideCatalogExportText,
  isDeclaredPositionSide,
  POSITION_SIDES,
} from './position-side-honesty.js';

describe('L3 wave203 position-side catalog honesty', () => {
  it('position side catalog boards', () => {
    expect(POSITION_SIDES).toEqual(['long', 'short']);
    expect(positionSideCatalogBoardCard()).toEqual({
      sides: 2,
      hasLong: 1,
      hasShort: 1,
    });
    expect(positionSideCatalogStatusLine()).toBe('sides=2 long=1 short=1');
    expect(positionSideCatalogStatusLineMatches()).toBe(true);
    expect(positionSideCatalogStatusLineConsistent(positionSideCatalogStatusLine())).toBe(true);
    expect(positionSideCatalogExportText().startsWith(positionSideCatalogExportHeader())).toBe(true);
    expect(positionSideCatalogExportLines()).toEqual([...POSITION_SIDES]);
    expect(isDeclaredPositionSide('long')).toBe(true);
    expect(isDeclaredPositionSide('buy')).toBe(false);
    expect(parsePositionSideCatalogStatusLine('nope')).toBeNull();
  });
});
