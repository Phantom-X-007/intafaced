import { describe, expect, it } from 'vitest';
import {
  planeCatalogBoardCard,
  planeCatalogStatusLine,
  parsePlaneCatalogStatusLine,
  planeCatalogStatusLineMatches,
  planeCatalogStatusLineConsistent,
  planeCatalogExportHeader,
  planeCatalogExportLines,
  planeCatalogExportText,
  isDeclaredPlane,
  PLANES,
} from './plane-honesty.js';

describe('L3 wave210 plane catalog honesty', () => {
  it('plane catalog boards', () => {
    expect(PLANES).toEqual(['fiat', 'protocol']);
    expect(planeCatalogBoardCard()).toEqual({
      planes: 2,
      hasFiat: 1,
      hasProtocol: 1,
    });
    expect(planeCatalogStatusLine()).toBe('planes=2 fiat=1 protocol=1');
    expect(planeCatalogStatusLineMatches()).toBe(true);
    expect(planeCatalogStatusLineConsistent(planeCatalogStatusLine())).toBe(true);
    expect(planeCatalogExportText().startsWith(planeCatalogExportHeader())).toBe(true);
    expect(planeCatalogExportLines()).toEqual([...PLANES]);
    expect(isDeclaredPlane('protocol')).toBe(true);
    expect(isDeclaredPlane('crypto')).toBe(false);
    expect(parsePlaneCatalogStatusLine('nope')).toBeNull();
  });
});
