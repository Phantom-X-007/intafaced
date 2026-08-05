import { describe, expect, it } from 'vitest';
import {
  countCurriculumByKind,
  countCurriculumByPath,
  CURRICULUM_PATHS,
  getCurriculumItem,
  hasCurriculumSlug,
  inventoryCurriculum,
  listCurriculum,
  isWorkbookSlug,
  listCurriculumSlugs,
  listCurriculumSlugsByKind,
  listPathsWithContent,
  listEmptyCurriculumPaths,
  listKindsWithContent,
  isPlaybookSlug,
  curriculumSpineSize,
  listCurriculumTitlesByPath,
  isLessonSlug,
  isSpineSlug,
  hasCurriculumPath,
  spineItemCount,
  listLessonSlugs,
  playbookCount,
  workbookCount,
  lessonCount,
  pathCountWithContent,
  listPlaybookSlugs,
  listWorkbookSlugs,
  kindCountWithContent,
  emptyPathCount,
  listCurriculumTitlesByKind,
  hasPlaybook,
  hasWorkbook,
  hasLesson,
  catalogSpineNonEmpty,
  foundationsItemCount,
  marketsItemCount,
  builderItemCount,
  sovereignItemCount,
  hasFoundationsPath,
  hasMarketsPath,
  hasBuilderPath,
  hasSovereignPath,
  emptyCurriculumPathCount,
  allPathsHaveContent,
  firstCurriculumSlug,
  lastCurriculumSlug,
  hasAtLeastSpineItems,
  listLessonTitles,
  listPlaybookTitles,
  spineSizeLabel,
  lessonSlugsJoined,
  playbookSlugsJoined,
  listWorkbookTitles,
} from './catalog.js';

/**
 * Curriculum catalog — pure, no database.
 *
 * Pins the thin slice: list is non-empty, filters work, content path returns a
 * body, unknown slug is null, and Blueprint paths are the only paths.
 */

describe('curriculum catalog', () => {
  it('lists a non-empty day-one spine', () => {
    const items = listCurriculum();
    expect(items.length).toBeGreaterThanOrEqual(4);
    for (const item of items) {
      expect(item.slug).toMatch(/^[a-z0-9-]+$/);
      expect(item.title.length).toBeGreaterThan(0);
      expect(item.summary.length).toBeGreaterThan(0);
      expect(CURRICULUM_PATHS).toContain(item.path);
      // Summaries never carry the body field — list is metadata only.
      expect(item).not.toHaveProperty('body');
    }
  });

  it('filters by Blueprint path', () => {
    const foundations = listCurriculum({ path: 'foundations' });
    expect(foundations.length).toBeGreaterThan(0);
    expect(foundations.every((i) => i.path === 'foundations')).toBe(true);

    const sovereign = listCurriculum({ path: 'sovereign' });
    expect(sovereign.every((i) => i.path === 'sovereign')).toBe(true);
  });

  it('filters by kind', () => {
    const playbooks = listCurriculum({ kind: 'playbook' });
    expect(playbooks.length).toBeGreaterThan(0);
    expect(playbooks.every((i) => i.kind === 'playbook')).toBe(true);
  });

  it('orders items within a path by order ascending', () => {
    const foundations = listCurriculum({ path: 'foundations' });
    const orders = foundations.map((i) => i.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it('returns full body for a known slug', () => {
    const item = getCurriculumItem('foundations-risk-first');
    expect(item).not.toBeNull();
    expect(item!.body).toContain('# Risk first');
    expect(item!.kind).toBe('playbook');
    expect(item!.path).toBe('foundations');
  });

  it('returns null for an unknown slug — no invented content', () => {
    expect(getCurriculumItem('does-not-exist')).toBeNull();
  });

  it('covers every Blueprint curriculum path at least once', () => {
    const paths = new Set(listCurriculum().map((i) => i.path));
    for (const path of CURRICULUM_PATHS) {
      expect(paths.has(path)).toBe(true);
    }
  });

  it('L3 inventoryCurriculum counts spine only — no invent residual library', () => {
    const inv = inventoryCurriculum();
    expect(inv.total).toBe(listCurriculum().length);
    expect(inv.byPath.foundations + inv.byPath.markets + inv.byPath.builder + inv.byPath.sovereign).toBe(inv.total);
    expect(inv.byKind.playbook + inv.byKind.workbook + inv.byKind.lesson).toBe(inv.total);
    expect(inv.total).toBeGreaterThan(0);
  });

  it('L3 hasCurriculumSlug false for residual invent titles', () => {
    expect(hasCurriculumSlug('foundations-risk-first')).toBe(true);
    expect(hasCurriculumSlug('not-a-real-deriv-desk-title')).toBe(false);
  });
  it('L3 listCurriculumSlugs is spine-only and sorted', () => {
    const slugs = listCurriculumSlugs();
    expect(slugs.length).toBe(listCurriculum().length);
    expect(slugs).toEqual([...slugs].sort());
    expect(slugs).toContain('foundations-risk-first');
    expect(slugs).not.toContain('not-a-real-deriv-desk-title');
  });

  it('L3 countCurriculumByPath matches inventory', () => {
    const inv = inventoryCurriculum();
    for (const path of CURRICULUM_PATHS) {
      expect(countCurriculumByPath(path)).toBe(inv.byPath[path]);
    }
  });

  it('spine bodies use platform vocabulary (Identity Blueprint appears; bodies are non-empty)', () => {
    // Doctrine §0.7 brand hygiene is owned by `pnpm scan:brand` (DoD gate) —
    // this assertion only pins that the seed is real content, not empty stubs.
    // Do not list forbidden vendor names here; the brand scanner rejects those
    // strings even inside tests.
    for (const summary of listCurriculum()) {
      const item = getCurriculumItem(summary.slug)!;
      expect(item.body.trim().length).toBeGreaterThan(40);
      expect(item.body.startsWith('#')).toBe(true);
    }
    const risk = getCurriculumItem('foundations-risk-first')!;
    expect(risk.body).toContain('Identity Blueprint');
  });

  it('L3 wave10 countCurriculumByKind + listCurriculumSlugsByKind', () => {
    const inv = inventoryCurriculum();
    expect(countCurriculumByKind('playbook')).toBe(inv.byKind.playbook);
    expect(countCurriculumByKind('workbook')).toBe(inv.byKind.workbook);
    expect(countCurriculumByKind('lesson')).toBe(inv.byKind.lesson);
    const playbooks = listCurriculumSlugsByKind('playbook');
    expect(playbooks.length).toBe(inv.byKind.playbook);
    expect(playbooks).toEqual([...playbooks].sort());
  });

  it('L3 listPathsWithContent covers spine paths only', () => {
    const paths = listPathsWithContent();
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) {
      expect(CURRICULUM_PATHS).toContain(p);
      expect(countCurriculumByPath(p)).toBeGreaterThan(0);
    }
  });

  it('L3 wave13 listEmptyCurriculumPaths + listKindsWithContent', () => {
    const empty = listEmptyCurriculumPaths();
    expect(Array.isArray(empty)).toBe(true);
    // empty paths must have zero inventory
    const inv = inventoryCurriculum();
    for (const p of empty) {
      expect(inv.byPath[p]).toBe(0);
    }
    const kinds = listKindsWithContent();
    expect(kinds.length).toBeGreaterThan(0);
    for (const k of kinds) {
      expect(inv.byKind[k]).toBeGreaterThan(0);
    }
  });

  it('L3 isWorkbookSlug false for non-workbook / unknown', () => {
    expect(isWorkbookSlug('not-a-real-slug')).toBe(false);
    const wb = listCurriculum({ kind: 'workbook' })[0];
    if (wb) expect(isWorkbookSlug(wb.slug)).toBe(true);
  });
  it('L3 isPlaybookSlug false for unknown', () => {
    expect(isPlaybookSlug('not-real')).toBe(false);
    const pb = listCurriculum({ kind: 'playbook' })[0];
    if (pb) expect(isPlaybookSlug(pb.slug)).toBe(true);
  });

  it('L3 wave16 curriculumSpineSize + listCurriculumTitlesByPath', () => {
    expect(curriculumSpineSize()).toBe(listCurriculum().length);
    expect(curriculumSpineSize()).toBeGreaterThan(0);
    const titles = listCurriculumTitlesByPath('foundations');
    expect(titles.length).toBe(countCurriculumByPath('foundations'));
    expect(titles).toEqual([...titles].sort());
  });

  it('L3 isLessonSlug false for unknown', () => {
    expect(isLessonSlug('not-real')).toBe(false);
    const lesson = listCurriculum({ kind: 'lesson' })[0];
    if (lesson) expect(isLessonSlug(lesson.slug)).toBe(true);
  });

  it('L3 isSpineSlug matches hasCurriculumSlug', () => {
    expect(isSpineSlug('not-real')).toBe(false);
    expect(isSpineSlug('foundations-risk-first')).toBe(hasCurriculumSlug('foundations-risk-first'));
  });

  it('L3 hasCurriculumPath for foundations', () => {
    expect(hasCurriculumPath('foundations')).toBe(true);
  });

  it('L3 spineItemCount matches inventory total', () => {
    expect(spineItemCount()).toBe(inventoryCurriculum().total);
    expect(spineItemCount()).toBeGreaterThan(0);
  });

  it('L3 wave21 listLessonSlugs + playbookCount', () => {
    const lessons = listLessonSlugs();
    expect(lessons).toEqual(listCurriculumSlugsByKind('lesson'));
    expect(playbookCount()).toBe(countCurriculumByKind('playbook'));
    expect(playbookCount()).toBeGreaterThan(0);
  });

  it('L3 workbookCount + lessonCount match inventory', () => {
    const inv = inventoryCurriculum();
    expect(workbookCount()).toBe(inv.byKind.workbook);
    expect(lessonCount()).toBe(inv.byKind.lesson);
  });

  it('L3 pathCountWithContent positive on tip', () => {
    expect(pathCountWithContent()).toBeGreaterThan(0);
  });

  it('L3 wave25 playbook/workbook slugs + kind/empty path counts', () => {
    expect(listPlaybookSlugs().length).toBe(playbookCount());
    expect(listWorkbookSlugs().length).toBe(workbookCount());
    expect(kindCountWithContent()).toBeGreaterThan(0);
    expect(emptyPathCount()).toBe(listEmptyCurriculumPaths().length);
  });

  it('L3 wave26 titles by kind + has playbook/workbook/lesson', () => {
    expect(listCurriculumTitlesByKind('playbook').length).toBe(playbookCount());
    expect(hasPlaybook()).toBe(playbookCount() > 0);
    expect(hasWorkbook()).toBe(workbookCount() > 0);
    expect(hasLesson()).toBe(lessonCount() > 0);
  });

  it('L3 wave27 spine non-empty + path item counts', () => {
    expect(catalogSpineNonEmpty()).toBe(true);
    expect(foundationsItemCount()).toBe(countCurriculumByPath('foundations'));
    expect(marketsItemCount()).toBe(countCurriculumByPath('markets'));
    expect(builderItemCount()).toBe(countCurriculumByPath('builder'));
  });

  it('L3 wave28 sovereign count + path presence', () => {
    expect(sovereignItemCount()).toBe(countCurriculumByPath('sovereign'));
    expect(hasFoundationsPath()).toBe(hasCurriculumPath('foundations'));
    expect(hasMarketsPath()).toBe(hasCurriculumPath('markets'));
    expect(hasBuilderPath()).toBe(hasCurriculumPath('builder'));
  });

  it('L3 wave29 sovereign + empty path count + all paths + first slug', () => {
    expect(hasSovereignPath()).toBe(hasCurriculumPath('sovereign'));
    expect(emptyCurriculumPathCount()).toBe(emptyPathCount());
    expect(typeof allPathsHaveContent()).toBe('boolean');
    expect(firstCurriculumSlug()).not.toBeNull();
  });

  it('L3 wave30 last slug + spine at-least + title lists', () => {
    expect(lastCurriculumSlug()).not.toBeNull();
    expect(hasAtLeastSpineItems(1)).toBe(true);
    expect(listLessonTitles().length).toBe(lessonCount());
    expect(listPlaybookTitles().length).toBe(playbookCount());
  });

  it('L3 wave31 spine label + slug joins + workbook titles', () => {
    expect(spineSizeLabel()).toBe(String(curriculumSpineSize()));
    expect(lessonSlugsJoined().split(',').filter(Boolean).length).toBe(lessonCount());
    expect(playbookSlugsJoined().split(',').filter(Boolean).length).toBe(playbookCount());
    expect(listWorkbookTitles().length).toBe(workbookCount());
  });
});
