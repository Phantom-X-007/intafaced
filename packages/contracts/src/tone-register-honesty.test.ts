import { describe, expect, it } from 'vitest';
import {
  toneRegisterCatalogBoardCard,
  toneRegisterCatalogStatusLine,
  parseToneRegisterCatalogStatusLine,
  toneRegisterCatalogStatusLineMatches,
  toneRegisterCatalogStatusLineConsistent,
  toneRegisterCatalogExportHeader,
  toneRegisterCatalogExportLines,
  toneRegisterCatalogExportText,
  isDeclaredToneRegister,
  TONE_REGISTERS,
} from './tone-register-honesty.js';

describe('L3 wave162 tone-register catalog honesty', () => {
  it('register catalog boards', () => {
    expect(TONE_REGISTERS).toEqual(['direct', 'warm', 'socratic', 'terse']);
    expect(toneRegisterCatalogBoardCard()).toEqual({
      registers: 4,
      hasDirect: 1,
      hasWarm: 1,
      hasSocratic: 1,
      hasTerse: 1,
    });
    expect(toneRegisterCatalogStatusLine()).toBe('registers=4 direct=1 warm=1 socratic=1 terse=1');
    expect(toneRegisterCatalogStatusLineMatches()).toBe(true);
    expect(toneRegisterCatalogStatusLineConsistent(toneRegisterCatalogStatusLine())).toBe(true);
    expect(toneRegisterCatalogExportText().startsWith(toneRegisterCatalogExportHeader())).toBe(true);
    expect(toneRegisterCatalogExportLines()).toEqual([...TONE_REGISTERS]);
    expect(isDeclaredToneRegister('socratic')).toBe(true);
    expect(isDeclaredToneRegister('loud')).toBe(false);
    expect(parseToneRegisterCatalogStatusLine('nope')).toBeNull();
  });
});
