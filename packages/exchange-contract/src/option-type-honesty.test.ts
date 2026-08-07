import { describe, expect, it } from 'vitest';
import {
  optionTypeCatalogBoardCard,
  optionTypeCatalogStatusLine,
  parseOptionTypeCatalogStatusLine,
  optionTypeCatalogStatusLineMatches,
  optionTypeCatalogStatusLineConsistent,
  optionTypeCatalogExportHeader,
  optionTypeCatalogExportLines,
  optionTypeCatalogExportText,
  isDeclaredOptionType,
  OPTION_TYPES,
} from './option-type-honesty.js';

describe('L3 wave201 option-type catalog honesty', () => {
  it('option type catalog boards', () => {
    expect(OPTION_TYPES).toEqual(['call', 'put']);
    expect(optionTypeCatalogBoardCard()).toEqual({
      types: 2,
      hasCall: 1,
      hasPut: 1,
    });
    expect(optionTypeCatalogStatusLine()).toBe('types=2 call=1 put=1');
    expect(optionTypeCatalogStatusLineMatches()).toBe(true);
    expect(optionTypeCatalogStatusLineConsistent(optionTypeCatalogStatusLine())).toBe(true);
    expect(optionTypeCatalogExportText().startsWith(optionTypeCatalogExportHeader())).toBe(true);
    expect(optionTypeCatalogExportLines()).toEqual([...OPTION_TYPES]);
    expect(isDeclaredOptionType('put')).toBe(true);
    expect(isDeclaredOptionType('binary')).toBe(false);
    expect(parseOptionTypeCatalogStatusLine('nope')).toBeNull();
  });
});
