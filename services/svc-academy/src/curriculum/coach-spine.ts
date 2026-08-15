/**
 * S2S coach spine — slug + title only (TRK-agents.coach).
 *
 * Academy owns the catalog. Agents must not copy it. This payload is the
 * read-port: platform-native spine, never lesson bodies, never a licensed
 * DERIV//DESK dump (Class X residual).
 */

import { curriculumSpineSize, listCurriculum } from './catalog.js';

export type CoachSpineItem = {
  readonly slug: string;
  readonly title: string;
};

export type CoachSpinePayload = {
  readonly items: readonly CoachSpineItem[];
  readonly licensedLibraryImported: false;
  readonly source: 'platform-spine';
};

export function coachSpinePayload(): CoachSpinePayload {
  return {
    items: listCurriculum().map((row) => ({ slug: row.slug, title: row.title })),
    licensedLibraryImported: false,
    source: 'platform-spine',
  };
}

export function coachSpineIsComplete(payload: CoachSpinePayload): boolean {
  return payload.items.length === curriculumSpineSize() && payload.items.length > 0;
}
