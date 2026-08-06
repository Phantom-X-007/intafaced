import { describe, expect, it } from 'vitest';
import {
  instrumentKindCatalogBoardCard,
  instrumentKindCatalogStatusLine,
  parseInstrumentKindCatalogStatusLine,
  instrumentKindCatalogStatusLineMatches,
  instrumentKindCatalogStatusLineConsistent,
  instrumentKindCatalogExportHeader,
  instrumentKindCatalogExportLines,
  instrumentKindCatalogExportText,
  isDeclaredInstrumentKind,
  INSTRUMENT_KINDS,
} from './instrument-kind-honesty.js';

describe('L3 wave151 instrument kind catalog honesty', () => {
  it('kind catalog boards', () => {
    expect(INSTRUMENT_KINDS).toEqual(['spot', 'futures', 'options']);
    expect(instrumentKindCatalogBoardCard()).toEqual({
      kinds: 3,
      hasSpot: 1,
      hasFutures: 1,
      hasOptions: 1,
    });
    expect(instrumentKindCatalogStatusLine()).toBe('kinds=3 spot=1 futures=1 options=1');
    expect(instrumentKindCatalogStatusLineMatches()).toBe(true);
    expect(instrumentKindCatalogStatusLineConsistent(instrumentKindCatalogStatusLine())).toBe(true);
    expect(instrumentKindCatalogExportText().startsWith(instrumentKindCatalogExportHeader())).toBe(true);
    expect(instrumentKindCatalogExportLines()).toEqual([...INSTRUMENT_KINDS]);
    expect(isDeclaredInstrumentKind('spot')).toBe(true);
    expect(isDeclaredInstrumentKind('swap')).toBe(false);
    expect(parseInstrumentKindCatalogStatusLine('nope')).toBeNull();
  });
});
