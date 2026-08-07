import { describe, expect, it } from 'vitest';
import {
  curriculumPathCatalogBoardCard,
  curriculumPathCatalogStatusLine,
  parseCurriculumPathCatalogStatusLine,
  curriculumPathCatalogStatusLineMatches,
  curriculumPathCatalogStatusLineConsistent,
  curriculumPathCatalogExportHeader,
  curriculumPathCatalogExportLines,
  curriculumPathCatalogExportText,
  isDeclaredCurriculumPath,
  CURRICULUM_PATHS,
} from './curriculum-path-honesty.js';

describe('L3 wave214 curriculum-path catalog honesty', () => {
  it('curriculum path catalog boards', () => {
    expect(CURRICULUM_PATHS).toEqual(['foundations', 'markets', 'builder', 'sovereign']);
    expect(curriculumPathCatalogBoardCard()).toEqual({
      paths: 4,
      hasFoundations: 1,
      hasMarkets: 1,
      hasBuilder: 1,
      hasSovereign: 1,
    });
    expect(curriculumPathCatalogStatusLine()).toBe('paths=4 foundations=1 markets=1 builder=1 sovereign=1');
    expect(curriculumPathCatalogStatusLineMatches()).toBe(true);
    expect(curriculumPathCatalogStatusLineConsistent(curriculumPathCatalogStatusLine())).toBe(true);
    expect(curriculumPathCatalogExportText().startsWith(curriculumPathCatalogExportHeader())).toBe(true);
    expect(curriculumPathCatalogExportLines()).toEqual([...CURRICULUM_PATHS]);
    expect(isDeclaredCurriculumPath('sovereign')).toBe(true);
    expect(isDeclaredCurriculumPath('advanced')).toBe(false);
    expect(parseCurriculumPathCatalogStatusLine('nope')).toBeNull();
  });
});
