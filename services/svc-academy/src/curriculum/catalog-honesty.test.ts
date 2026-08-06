import { describe, expect, it } from 'vitest';
import {
  curriculumEnumCatalogBoardCard,
  curriculumEnumCatalogStatusLine,
  parseCurriculumEnumCatalogStatusLine,
  curriculumEnumCatalogStatusLineMatches,
  curriculumKindHistogram,
  curriculumCatalogueBoardCard,
  curriculumCatalogueStatusLine,
  parseCurriculumCatalogueStatusLine,
  curriculumCatalogueStatusLineMatches,
  curriculumCatalogueStatusLineConsistent,
  curriculumCatalogueExportHeader,
  curriculumCatalogueExportLine,
  curriculumCatalogueExportText,
  isDeclaredCurriculumPath,
  curriculumItemCountInRange,
  CURRICULUM_PATHS,
  CURRICULUM_KINDS,
  type CurriculumItemBoardInput,
} from './catalog-honesty.js';

describe('L3 wave87 curriculum catalog honesty', () => {
  it('enum and fixture catalogue boards', () => {
    expect(CURRICULUM_PATHS).toHaveLength(4);
    expect(CURRICULUM_KINDS).toHaveLength(3);
    expect(curriculumEnumCatalogBoardCard()).toEqual({ paths: 4, kinds: 3 });
    expect(curriculumEnumCatalogStatusLineMatches()).toBe(true);
    expect(parseCurriculumEnumCatalogStatusLine(curriculumEnumCatalogStatusLine())).toEqual({
      paths: 4,
      kinds: 3,
    });

    const empty: readonly CurriculumItemBoardInput[] = [];
    expect(curriculumCatalogueBoardCard(empty).items).toBe(0);
    expect(curriculumCatalogueStatusLineMatches(empty)).toBe(true);

    const mixed: readonly CurriculumItemBoardInput[] = [
      { slug: 'a', kind: 'playbook', path: 'foundations', order: 10 },
      { slug: 'b', kind: 'workbook', path: 'markets', order: 20 },
      { slug: 'c', kind: 'lesson', path: 'foundations', order: 30 },
      { slug: 'd', kind: 'playbook', path: 'builder', order: 40 },
    ];
    expect(curriculumKindHistogram(mixed)).toEqual({ playbook: 2, workbook: 1, lesson: 1 });
    expect(curriculumCatalogueBoardCard(mixed)).toEqual({
      items: 4,
      playbooks: 2,
      workbooks: 1,
      lessons: 1,
      pathsUsed: 3,
    });
    expect(curriculumCatalogueStatusLine(mixed)).toBe(
      'items=4 playbooks=2 workbooks=1 lessons=1 paths_used=3',
    );
    expect(curriculumCatalogueStatusLineMatches(mixed)).toBe(true);
    expect(curriculumCatalogueStatusLineConsistent(curriculumCatalogueStatusLine(mixed))).toBe(
      true,
    );
    expect(curriculumCatalogueExportText(mixed).startsWith(curriculumCatalogueExportHeader())).toBe(
      true,
    );
    expect(curriculumCatalogueExportLine(mixed)).toBe('4,2,1,1,3');
    expect(isDeclaredCurriculumPath('sovereign')).toBe(true);
    expect(isDeclaredCurriculumPath('ghost')).toBe(false);
    expect(curriculumItemCountInRange(mixed, 4, 4)).toBe(true);
    expect(curriculumItemCountInRange(mixed, 5, 1)).toBe(false);
    expect(parseCurriculumCatalogueStatusLine('nope')).toBeNull();
  });
});
