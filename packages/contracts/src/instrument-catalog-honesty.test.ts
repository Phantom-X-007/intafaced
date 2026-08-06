import { describe, expect, it } from 'vitest';
import {
  instrumentEnumCatalogBoardCard,
  instrumentEnumCatalogStatusLine,
  parseInstrumentEnumCatalogStatusLine,
  instrumentEnumCatalogStatusLineMatches,
  instrumentStatusHistogram,
  instrumentClassHistogram,
  instrumentCatalogueBoardCard,
  instrumentCatalogueStatusLine,
  parseInstrumentCatalogueStatusLine,
  instrumentCatalogueStatusLineMatches,
  instrumentCatalogueStatusLineConsistent,
  instrumentCatalogueExportHeader,
  instrumentCatalogueExportLine,
  instrumentCatalogueExportText,
  instrumentCountInRange,
  ASSET_CLASS_CATALOG,
  INSTRUMENT_KIND_CATALOG,
  type InstrumentBoardInput,
} from './instrument-catalog-honesty.js';

describe('L3 wave79 instrument catalog honesty', () => {
  it('enum catalog sizes', () => {
    expect(ASSET_CLASS_CATALOG).toHaveLength(3);
    expect(INSTRUMENT_KIND_CATALOG).toHaveLength(3);
    expect(instrumentEnumCatalogBoardCard()).toEqual({
      assetClasses: 3,
      units: 4,
      kinds: 3,
      statuses: 4,
      schedules: 3,
    });
    expect(instrumentEnumCatalogStatusLineMatches()).toBe(true);
    expect(parseInstrumentEnumCatalogStatusLine(instrumentEnumCatalogStatusLine())).toEqual({
      assetClasses: 3,
      units: 4,
      kinds: 3,
      statuses: 4,
      schedules: 3,
    });
    expect(parseInstrumentEnumCatalogStatusLine('nope')).toBeNull();
  });

  it('fixture catalogue boards', () => {
    const empty: readonly InstrumentBoardInput[] = [];
    expect(instrumentCatalogueBoardCard(empty).instruments).toBe(0);
    expect(instrumentCatalogueStatusLineMatches(empty)).toBe(true);
    expect(instrumentCatalogueStatusLineConsistent(instrumentCatalogueStatusLine(empty))).toBe(true);

    const mixed: readonly InstrumentBoardInput[] = [
      { assetClass: 'crypto', kind: 'spot', status: 'active', unit: 'unit' },
      { assetClass: 'forex', kind: 'spot', status: 'active', unit: 'unit' },
      { assetClass: 'commodity', kind: 'futures', status: 'halted', unit: 'troy_ounce' },
    ];
    expect(instrumentStatusHistogram(mixed)).toEqual({ active: 2, halted: 1 });
    expect(instrumentClassHistogram(mixed)).toEqual({ crypto: 1, forex: 1, commodity: 1 });
    expect(instrumentCatalogueBoardCard(mixed)).toEqual({
      instruments: 3,
      active: 2,
      halted: 1,
      crypto: 1,
      commodity: 1,
      forex: 1,
    });
    expect(instrumentCatalogueStatusLine(mixed)).toBe('instruments=3 active=2 halted=1 crypto=1 commodity=1 forex=1');
    expect(instrumentCatalogueStatusLineMatches(mixed)).toBe(true);
    expect(instrumentCatalogueStatusLineConsistent(instrumentCatalogueStatusLine(mixed))).toBe(true);
    expect(instrumentCatalogueExportText(mixed).startsWith(instrumentCatalogueExportHeader())).toBe(true);
    expect(instrumentCatalogueExportLine(mixed)).toBe('3,2,1,1,1,1');
    expect(instrumentCountInRange(mixed, 3, 3)).toBe(true);
    expect(instrumentCountInRange(mixed, 4, 1)).toBe(false);
    expect(parseInstrumentCatalogueStatusLine('nope')).toBeNull();
  });
});
