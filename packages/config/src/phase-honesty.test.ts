import { describe, expect, it } from 'vitest';
import {
  phaseCatalogBoardCard,
  phaseCatalogStatusLine,
  parsePhaseCatalogStatusLine,
  phaseCatalogStatusLineMatches,
  phaseCatalogStatusLineConsistent,
  phaseCatalogExportHeader,
  phaseCatalogExportLines,
  phaseCatalogExportText,
  isDeclaredPhase,
  PHASES,
} from './phase-honesty.js';

describe('L3 wave213 phase catalog honesty', () => {
  it('phase catalog boards', () => {
    expect(PHASES).toEqual(['0', '1', '2', '3', '3P', '4', '4P', '5', '5P']);
    expect(phaseCatalogBoardCard()).toEqual({
      phases: 9,
      hasZero: 1,
      has5: 1,
      has3P: 1,
      has5P: 1,
    });
    expect(phaseCatalogStatusLine()).toBe('phases=9 zero=1 five=1 three_p=1 five_p=1');
    expect(phaseCatalogStatusLineMatches()).toBe(true);
    expect(phaseCatalogStatusLineConsistent(phaseCatalogStatusLine())).toBe(true);
    expect(phaseCatalogExportText().startsWith(phaseCatalogExportHeader())).toBe(true);
    expect(phaseCatalogExportLines()).toEqual([...PHASES]);
    expect(isDeclaredPhase('4P')).toBe(true);
    expect(isDeclaredPhase('6')).toBe(false);
    expect(parsePhaseCatalogStatusLine('nope')).toBeNull();
  });
});
