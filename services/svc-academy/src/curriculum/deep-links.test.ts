import { describe, expect, it } from 'vitest';
import {
  CURRICULUM_DEEP_LINK_PREFIX,
  curriculumDeepLinksVerified,
  deepLinkForSlug,
  listCurriculumPathDeepLinks,
  resolveCurriculumDeepLink,
} from './deep-links.js';
import { CURRICULUM_PATHS } from './catalog.js';

describe('resolveCurriculumDeepLink — Stage-3 Blueprint paths', () => {
  it('builds a path index href for every Blueprint curriculumPath', () => {
    for (const path of CURRICULUM_PATHS) {
      const resolved = resolveCurriculumDeepLink({ path });
      expect(resolved).toEqual({
        ok: true,
        path,
        slug: null,
        href: `${CURRICULUM_DEEP_LINK_PREFIX}/${path}`,
      });
    }
  });

  it('refuses unknown path and unknown slug', () => {
    expect(resolveCurriculumDeepLink({ path: 'moon' }).ok).toBe(false);
    expect(resolveCurriculumDeepLink({ path: 'foundations', slug: 'no-such-item' })).toMatchObject({
      ok: false,
      reason: 'unknown_slug',
    });
  });

  it('refuses path/slug mismatch and accepts a real spine item', () => {
    expect(resolveCurriculumDeepLink({ path: 'markets', slug: 'foundations-risk-first' })).toMatchObject({
      ok: false,
      reason: 'path_mismatch',
    });
    expect(resolveCurriculumDeepLink({ path: 'foundations', slug: 'foundations-risk-first' })).toEqual({
      ok: true,
      path: 'foundations',
      slug: 'foundations-risk-first',
      href: `${CURRICULUM_DEEP_LINK_PREFIX}/foundations/foundations-risk-first`,
    });
  });
});

describe('curriculum deep-link helpers', () => {
  it('lists path indexes only for paths with content and verifies them', () => {
    const links = listCurriculumPathDeepLinks();
    expect(links.length).toBe(CURRICULUM_PATHS.length);
    expect(links.every((row) => row.itemCount > 0 && row.href.startsWith(CURRICULUM_DEEP_LINK_PREFIX))).toBe(true);
    expect(curriculumDeepLinksVerified()).toBe(true);
  });

  it('deepLinkForSlug returns null for unknown, href for known', () => {
    expect(deepLinkForSlug('nope')).toBeNull();
    expect(deepLinkForSlug('foundations-paper-workbook')).toBe(`${CURRICULUM_DEEP_LINK_PREFIX}/foundations/foundations-paper-workbook`);
  });
});
