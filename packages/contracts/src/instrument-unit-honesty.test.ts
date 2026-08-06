import { describe, expect, it } from 'vitest';
import {
  instrumentUnitCatalogBoardCard,
  instrumentUnitCatalogStatusLine,
  parseInstrumentUnitCatalogStatusLine,
  instrumentUnitCatalogStatusLineMatches,
  instrumentUnitCatalogStatusLineConsistent,
  instrumentUnitCatalogExportHeader,
  instrumentUnitCatalogExportLines,
  instrumentUnitCatalogExportText,
  isDeclaredInstrumentUnit,
  INSTRUMENT_UNITS,
} from './instrument-unit-honesty.js';

describe('L3 wave148 instrument unit catalog honesty', () => {
  it('unit catalog boards', () => {
    expect(INSTRUMENT_UNITS).toHaveLength(4);
    expect(instrumentUnitCatalogBoardCard()).toEqual({
      units: 4,
      hasUnit: 1,
      hasTroyOunce: 1,
      hasBarrel: 1,
    });
    expect(instrumentUnitCatalogStatusLine()).toBe(
      'units=4 unit=1 troy_ounce=1 barrel=1',
    );
    expect(instrumentUnitCatalogStatusLineMatches()).toBe(true);
    expect(instrumentUnitCatalogStatusLineConsistent(instrumentUnitCatalogStatusLine())).toBe(
      true,
    );
    expect(instrumentUnitCatalogExportText().startsWith(instrumentUnitCatalogExportHeader())).toBe(
      true,
    );
    expect(instrumentUnitCatalogExportLines()).toEqual([...INSTRUMENT_UNITS]);
    expect(isDeclaredInstrumentUnit('mmbtu')).toBe(true);
    expect(isDeclaredInstrumentUnit('gram')).toBe(false);
    expect(parseInstrumentUnitCatalogStatusLine('nope')).toBeNull();
  });
});
