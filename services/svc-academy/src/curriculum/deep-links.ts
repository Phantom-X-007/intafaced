/**
 * CURRICULUM DEEP-LINKS — Stage-3 polish (TRK-academy.curriculum).
 *
 * Blueprint `curriculumPath` (foundations | markets | builder | sovereign) is
 * the only path namespace. Deep-links are platform-owned route shapes — not a
 * second catalog, not licensed-library invent, no money.
 */

import type { CurriculumPath } from './catalog.js';
import { CURRICULUM_PATHS, getCurriculumItem, listCurriculum } from './catalog.js';

/** Stable product route prefix for academy curriculum surfaces. */
export const CURRICULUM_DEEP_LINK_PREFIX = '/academy/curriculum' as const;

export type CurriculumDeepLink =
  | {
      readonly ok: true;
      readonly path: CurriculumPath;
      readonly slug: string | null;
      readonly href: string;
    }
  | {
      readonly ok: false;
      readonly reason: 'unknown_path' | 'unknown_slug' | 'path_mismatch';
      readonly message: string;
    };

function isCurriculumPath(value: string): value is CurriculumPath {
  return (CURRICULUM_PATHS as readonly string[]).includes(value);
}

/**
 * Build a Blueprint-aligned deep-link.
 * - path only → `/academy/curriculum/{path}`
 * - path + slug → `/academy/curriculum/{path}/{slug}` (slug must exist on that path)
 */
export function resolveCurriculumDeepLink(input: {
  readonly path: string;
  readonly slug?: string;
}): CurriculumDeepLink {
  if (!isCurriculumPath(input.path)) {
    return {
      ok: false,
      reason: 'unknown_path',
      message: `path must be one of ${CURRICULUM_PATHS.join('|')}`,
    };
  }

  const slug = input.slug?.trim() || null;
  if (!slug) {
    return {
      ok: true,
      path: input.path,
      slug: null,
      href: `${CURRICULUM_DEEP_LINK_PREFIX}/${input.path}`,
    };
  }

  const item = getCurriculumItem(slug);
  if (!item) {
    return {
      ok: false,
      reason: 'unknown_slug',
      message: `Curriculum item "${slug}" is not in the catalog spine`,
    };
  }
  if (item.path !== input.path) {
    return {
      ok: false,
      reason: 'path_mismatch',
      message: `Slug "${slug}" belongs to path "${item.path}", not "${input.path}"`,
    };
  }

  return {
    ok: true,
    path: input.path,
    slug,
    href: `${CURRICULUM_DEEP_LINK_PREFIX}/${input.path}/${slug}`,
  };
}

/** Deep-link for a known spine slug (path taken from the item). Unknown → null. */
export function deepLinkForSlug(slug: string): string | null {
  const item = getCurriculumItem(slug.trim());
  if (!item) return null;
  const resolved = resolveCurriculumDeepLink({ path: item.path, slug: item.slug });
  return resolved.ok ? resolved.href : null;
}

/** Path-index deep-links for every Blueprint path that has ≥1 spine item. */
export function listCurriculumPathDeepLinks(): readonly {
  readonly path: CurriculumPath;
  readonly href: string;
  readonly itemCount: number;
}[] {
  return CURRICULUM_PATHS.map((path) => ({
    path,
    href: `${CURRICULUM_DEEP_LINK_PREFIX}/${path}`,
    itemCount: listCurriculum({ path }).length,
  })).filter((row) => row.itemCount > 0);
}

/** True when every Blueprint path with content has a resolvable index deep-link. */
export function curriculumDeepLinksVerified(): boolean {
  const links = listCurriculumPathDeepLinks();
  if (links.length === 0) return false;
  return links.every((row) => {
    const resolved = resolveCurriculumDeepLink({ path: row.path });
    return resolved.ok && resolved.href === row.href;
  });
}
