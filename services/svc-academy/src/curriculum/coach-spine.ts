/**
 * S2S coach spine — slug + title only (TRK-agents.coach).
 *
 * Academy owns the catalog. Agents must not copy it. This payload is the
 * read-port: platform-native spine, never lesson bodies, never a licensed
 * DERIV//DESK dump (Class X residual).
 */

import { curriculumSpineSize, getCurriculumItem, listCurriculum } from './catalog.js';

export type CoachSpineItem = {
  readonly slug: string;
  readonly title: string;
};

/**
 * Licensed DERIV//DESK library is not in this monorepo (Class X / owner content).
 * Typed `false` so a default-true import flag cannot sneak in.
 */
export const LICENSED_LIBRARY_IMPORTED: false = false;

/**
 * Resolve a caller-supplied import flag. Missing/undefined is false.
 * An explicit true still cannot claim the licensed library on tip.
 */
export function resolveLicensedLibraryImported(flag?: boolean): false {
  if (flag === true) return LICENSED_LIBRARY_IMPORTED;
  return LICENSED_LIBRARY_IMPORTED;
}

export type CoachSpinePayload = {
  readonly items: readonly CoachSpineItem[];
  readonly licensedLibraryImported: false;
  readonly source: 'platform-spine';
};

export function coachSpinePayload(): CoachSpinePayload {
  return {
    items: listCurriculum().map((row) => ({ slug: row.slug, title: row.title })),
    licensedLibraryImported: resolveLicensedLibraryImported(),
    source: 'platform-spine',
  };
}

export function coachSpineIsComplete(payload: CoachSpinePayload): boolean {
  return (
    payload.licensedLibraryImported === LICENSED_LIBRARY_IMPORTED &&
    payload.items.length === curriculumSpineSize() &&
    payload.items.length > 0
  );
}

/** Spine catalog as slug+title only — never invent residual library titles. */
export function listCoachSpineSlugTitles(): readonly CoachSpineItem[] {
  return coachSpinePayload().items;
}

/** True when every spine row is slug+title matching the catalog, nothing extra. */
export function coachSpineSlugTitleOnly(payload: CoachSpinePayload = coachSpinePayload()): boolean {
  if (payload.licensedLibraryImported !== false) return false;
  for (const item of payload.items) {
    const keys = Object.keys(item).sort();
    if (keys.length !== 2 || keys[0] !== 'slug' || keys[1] !== 'title') return false;
    const row = getCurriculumItem(item.slug);
    if (!row || row.title !== item.title) return false;
  }
  return payload.items.length === curriculumSpineSize();
}
