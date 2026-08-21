import { describe, expect, it } from 'vitest';
import { curriculumSpineSize, getCurriculumItem, hasCurriculumSlug, listCurriculumSlugs } from './catalog.js';
import {
  LICENSED_LIBRARY_IMPORTED,
  coachSpineIsComplete,
  coachSpinePayload,
  coachSpineSlugTitleOnly,
  listCoachSpineSlugTitles,
  resolveLicensedLibraryImported,
} from './coach-spine.js';

describe('coach spine — unlicensed pin', () => {
  it('lists slug+title for every spine row and never a lesson body', () => {
    const payload = coachSpinePayload();
    expect(coachSpineIsComplete(payload)).toBe(true);
    expect(payload.licensedLibraryImported).toBe(false);
    expect(payload.source).toBe('platform-spine');
    expect(payload.items.length).toBe(curriculumSpineSize());
    expect(payload.items.length).toBeGreaterThan(0);
    for (const item of payload.items) {
      expect(hasCurriculumSlug(item.slug)).toBe(true);
      expect(item.title.length).toBeGreaterThan(0);
      expect(item).not.toHaveProperty('body');
      expect(getCurriculumItem(item.slug)?.title).toBe(item.title);
    }
    expect(payload.items.map((i) => i.slug).sort()).toEqual([...listCurriculumSlugs()].slice().sort());
  });

  it('pins licensedLibraryImported false — missing/true cannot sneak in as imported', () => {
    expect(LICENSED_LIBRARY_IMPORTED).toBe(false);
    expect(resolveLicensedLibraryImported()).toBe(false);
    expect(resolveLicensedLibraryImported(undefined)).toBe(false);
    expect(resolveLicensedLibraryImported(false)).toBe(false);
    expect(resolveLicensedLibraryImported(true)).toBe(false);
    expect(coachSpinePayload().licensedLibraryImported).toBe(LICENSED_LIBRARY_IMPORTED);
  });

  it('exposes slug+title catalog only — no invented licensed-library titles', () => {
    const items = listCoachSpineSlugTitles();
    expect(coachSpineSlugTitleOnly()).toBe(true);
    expect(items.length).toBe(curriculumSpineSize());
    for (const item of items) {
      expect(Object.keys(item).sort()).toEqual(['slug', 'title']);
      expect(hasCurriculumSlug(item.slug)).toBe(true);
    }
    expect(items.some((i) => i.slug === 'not-a-real-deriv-desk-title')).toBe(false);
  });
});
