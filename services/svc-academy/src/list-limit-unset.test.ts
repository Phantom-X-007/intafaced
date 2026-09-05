/**
 * Unit card — in-memory academy list helpers refuse unpublished page size
 *
 * 1. Promise: omit / null / 0 / negative / garbage throws *_list_limit_unset.
 *    Owner-explicit positive limit slices. Never invent all.length.
 * 2. Break: `options.limit ?? all.length` dumps the whole collection.
 * 3. Done bar: unset throws typed error; published 2 slices
 * 4. Class N
 * 5. Paths: services/svc-academy list helpers only
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AcademyError } from './errors.js';
import { AmbassadorProgrammeError, MemoryAmbassadorProgramme } from './ambassadors/programme.js';
import { MemoryResidencyDesk, ResidencyError } from './ambassadors/residency.js';
import { pageCurriculumSlugs, pageLessonSlugs } from './curriculum/catalog.js';
import { pageCompletedStepIds, pageRemainingStepIds, startPaperDrill } from './paper/workbook-loop.js';
import { pageLiveSeasonIds, pageSeasonIds } from './tournaments/season-lifecycle.js';
import { TournamentError, type SeasonRecord } from './tournaments/ladder.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

const GARBAGE = { limit: 'nope' as unknown as number };
const UNSET: Array<{ offset?: number; limit?: number } | undefined> = [
  undefined,
  {},
  { offset: 0 },
  { limit: undefined },
  { limit: null as unknown as number },
  { limit: Number.NaN },
  { limit: Number.POSITIVE_INFINITY },
  { limit: 0 },
  { limit: -1 },
  GARBAGE,
];

describe('svc-academy list helpers refuse unset limit', () => {
  it('programme page ids refuse omit/null/0/negative/garbage — never invent all.length', () => {
    const desk = new MemoryAmbassadorProgramme();
    const op = '22222222-2222-4222-8222-222222222222';
    desk.appoint({ userId: '11111111-1111-4111-8111-111111111111', appointedBy: op });
    desk.appoint({ userId: '33333333-3333-4333-8333-333333333333', appointedBy: op });
    desk.appoint({ userId: '44444444-4444-4444-8444-444444444444', appointedBy: op });
    for (const options of UNSET) {
      expect(() => desk.pageProgrammeUserIds(options ?? {})).toThrow(AmbassadorProgrammeError);
      expect(() => desk.pageActiveUserIds(options ?? {})).toThrow(AmbassadorProgrammeError);
      expect(() => desk.pageFrozenUserIds(options ?? {})).toThrow(AmbassadorProgrammeError);
    }
    expect(() => desk.pageProgrammeUserIds()).toThrow(AmbassadorProgrammeError);
    try {
      desk.pageProgrammeUserIds();
      throw new Error('expected refuse');
    } catch (e) {
      expect(e).toBeInstanceOf(AmbassadorProgrammeError);
      expect((e as AmbassadorProgrammeError).code).toBe('academy.programme_list_limit_unset');
    }
  });

  it('programme published limit slices', () => {
    const desk = new MemoryAmbassadorProgramme();
    const op = '22222222-2222-4222-8222-222222222222';
    const u1 = '11111111-1111-4111-8111-111111111111';
    const u2 = '33333333-3333-4333-8333-333333333333';
    const u3 = '44444444-4444-4444-8444-444444444444';
    desk.appoint({ userId: u1, appointedBy: op });
    desk.appoint({ userId: u2, appointedBy: op });
    desk.appoint({ userId: u3, appointedBy: op });
    const all = desk.pageProgrammeUserIds({ limit: 10 });
    expect(all).toHaveLength(3);
    expect(desk.pageProgrammeUserIds({ offset: 0, limit: 2 })).toEqual(all.slice(0, 2));
    expect(desk.pageActiveUserIds({ limit: 1 })).toHaveLength(1);
  });

  it('residency page ids refuse omit/null/0/negative/garbage', () => {
    const desk = new MemoryResidencyDesk();
    const statement = 'I host weekly risk-first lobbies and can commit six hours a week.';
    desk.apply({ userId: 'u1', cohortSlug: 'bali-2026', statement });
    desk.apply({ userId: 'u2', cohortSlug: 'bali-2026', statement });
    desk.apply({ userId: 'u3', cohortSlug: 'bali-2026', statement });
    for (const options of UNSET) {
      expect(() => desk.pageOpenApplicationIds(options ?? {})).toThrow(ResidencyError);
      expect(() => desk.pageAcceptedApplicationIds(options ?? {})).toThrow(ResidencyError);
      expect(() => desk.pageAllApplicationIds(options ?? {})).toThrow(ResidencyError);
    }
    try {
      desk.pageAllApplicationIds();
      throw new Error('expected refuse');
    } catch (e) {
      expect(e).toBeInstanceOf(ResidencyError);
      expect((e as ResidencyError).code).toBe('academy.residency_list_limit_unset');
    }
  });

  it('residency published limit slices', () => {
    const desk = new MemoryResidencyDesk();
    const statement = 'I host weekly risk-first lobbies and can commit six hours a week.';
    desk.apply({ userId: 'u1', cohortSlug: 'bali-2026', statement });
    desk.apply({ userId: 'u2', cohortSlug: 'bali-2026', statement });
    desk.apply({ userId: 'u3', cohortSlug: 'bali-2026', statement });
    const all = desk.pageAllApplicationIds({ limit: 10 });
    expect(all).toHaveLength(3);
    expect(desk.pageOpenApplicationIds({ offset: 0, limit: 2 })).toEqual(all.slice(0, 2));
  });

  it('curriculum page slugs refuse omit/null/0/negative/garbage', () => {
    for (const options of UNSET) {
      expect(() => pageCurriculumSlugs(options ?? {})).toThrow(AcademyError);
      expect(() => pageLessonSlugs(options ?? {})).toThrow(AcademyError);
    }
    try {
      pageCurriculumSlugs();
      throw new Error('expected refuse');
    } catch (e) {
      expect(e).toBeInstanceOf(AcademyError);
      expect((e as AcademyError).code).toBe('academy.curriculum_list_limit_unset');
    }
  });

  it('curriculum published limit slices', () => {
    const all = pageCurriculumSlugs({ limit: 200 });
    expect(all.length).toBeGreaterThan(2);
    expect(pageCurriculumSlugs({ offset: 0, limit: 2 })).toEqual(all.slice(0, 2));
    expect(pageLessonSlugs({ limit: 100 }).length).toBeGreaterThan(0);
  });

  it('paper drill page ids refuse omit/null/0/negative/garbage', () => {
    const start = startPaperDrill({
      workbookSlug: 'foundations-paper-workbook',
      market: { marketId: 'p1', paper: true, symbol: 'PAPER/USD' },
    });
    expect(start.ok).toBe(true);
    if (!start.ok) return;
    for (const options of UNSET) {
      expect(() => pageRemainingStepIds(start.run, options ?? {})).toThrow(AcademyError);
      expect(() => pageCompletedStepIds(start.run, options ?? {})).toThrow(AcademyError);
    }
    try {
      pageRemainingStepIds(start.run);
      throw new Error('expected refuse');
    } catch (e) {
      expect(e).toBeInstanceOf(AcademyError);
      expect((e as AcademyError).code).toBe('academy.paper_list_limit_unset');
    }
  });

  it('paper drill published limit slices', () => {
    const start = startPaperDrill({
      workbookSlug: 'foundations-paper-workbook',
      market: { marketId: 'p1', paper: true, symbol: 'PAPER/USD' },
    });
    expect(start.ok).toBe(true);
    if (!start.ok) return;
    const all = pageRemainingStepIds(start.run, { limit: 10 });
    expect(all).toHaveLength(3);
    expect(pageRemainingStepIds(start.run, { offset: 0, limit: 2 })).toEqual(all.slice(0, 2));
    expect(pageCompletedStepIds(start.run, { limit: 5 })).toEqual([]);
  });

  it('season page ids refuse omit/null/0/negative/garbage', () => {
    const mk = (id: string, status: SeasonRecord['status']): SeasonRecord => ({
      id,
      slug: id,
      title: id,
      status,
      rulesSummary: 'non-money',
      startsAt: new Date('2026-01-01T00:00:00Z'),
      endsAt: null,
    });
    const rows = [mk('a', 'live'), mk('b', 'ended'), mk('c', 'live')];
    for (const options of UNSET) {
      expect(() => pageSeasonIds(rows, options ?? {})).toThrow(TournamentError);
      expect(() => pageLiveSeasonIds(rows, options ?? {})).toThrow(TournamentError);
    }
    try {
      pageSeasonIds(rows);
      throw new Error('expected refuse');
    } catch (e) {
      expect(e).toBeInstanceOf(TournamentError);
      expect((e as TournamentError).code).toBe('academy.season_list_limit_unset');
    }
  });

  it('season published limit slices', () => {
    const mk = (id: string, status: SeasonRecord['status']): SeasonRecord => ({
      id,
      slug: id,
      title: id,
      status,
      rulesSummary: 'non-money',
      startsAt: new Date('2026-01-01T00:00:00Z'),
      endsAt: null,
    });
    const rows = [mk('a', 'live'), mk('b', 'ended'), mk('c', 'live')];
    expect(pageSeasonIds(rows, { offset: 0, limit: 2 })).toHaveLength(2);
    expect(pageLiveSeasonIds(rows, { limit: 10 })).toEqual(['a', 'c']);
  });

  it('source does not invent all.length when limit is omitted', () => {
    const files = [
      'services/svc-academy/src/ambassadors/programme.ts',
      'services/svc-academy/src/ambassadors/residency.ts',
      'services/svc-academy/src/curriculum/catalog.ts',
      'services/svc-academy/src/paper/workbook-loop.ts',
      'services/svc-academy/src/tournaments/season-lifecycle.ts',
    ];
    for (const rel of files) {
      const src = readFileSync(join(ROOT, rel), 'utf8');
      expect(src).not.toMatch(/limit \?\? all\.length/);
    }
  });
});
