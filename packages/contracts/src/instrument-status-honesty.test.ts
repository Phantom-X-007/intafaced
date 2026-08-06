import { describe, expect, it } from 'vitest';
import {
  instrumentStatusCatalogBoardCard,
  instrumentStatusCatalogStatusLine,
  parseInstrumentStatusCatalogStatusLine,
  instrumentStatusCatalogStatusLineMatches,
  instrumentStatusCatalogStatusLineConsistent,
  instrumentStatusCatalogExportHeader,
  instrumentStatusCatalogExportLines,
  instrumentStatusCatalogExportText,
  isDeclaredInstrumentStatus,
  INSTRUMENT_STATUSES,
} from './instrument-status-honesty.js';

describe('L3 wave158 instrument status catalog honesty', () => {
  it('status catalog boards', () => {
    expect(INSTRUMENT_STATUSES).toEqual(['pending', 'active', 'halted', 'delisted']);
    expect(instrumentStatusCatalogBoardCard()).toEqual({
      statuses: 4,
      hasPending: 1,
      hasActive: 1,
      hasHalted: 1,
      hasDelisted: 1,
    });
    expect(instrumentStatusCatalogStatusLine()).toBe('statuses=4 pending=1 active=1 halted=1 delisted=1');
    expect(instrumentStatusCatalogStatusLineMatches()).toBe(true);
    expect(instrumentStatusCatalogStatusLineConsistent(instrumentStatusCatalogStatusLine())).toBe(true);
    expect(instrumentStatusCatalogExportText().startsWith(instrumentStatusCatalogExportHeader())).toBe(true);
    expect(instrumentStatusCatalogExportLines()).toEqual([...INSTRUMENT_STATUSES]);
    expect(isDeclaredInstrumentStatus('halted')).toBe(true);
    expect(isDeclaredInstrumentStatus('archived')).toBe(false);
    expect(parseInstrumentStatusCatalogStatusLine('nope')).toBeNull();
  });
});
