/**
 * agents.coach product policy — curriculum-grounded coaching honesty (§8.2 / §25:708).
 *
 * Not advice. Licensed library never invented. Positions owner-undecided → refuse.
 */
import { COACH_REFUSE_COPY, type CoachRefuseReason } from './grounded-session.js';

export const COACH_REFUSE_REASONS = [
  'curriculum_empty',
  'library_import_pending',
  'invented_library',
  'positions_not_decided',
  'advice_forbidden',
] as const satisfies readonly CoachRefuseReason[];

export type CoachPolicySummary = ReturnType<typeof describeCoachPolicy>;

/** Public honesty board for agents.coach grounded sessions. */
export function describeCoachPolicy() {
  return {
    notAdvice: true as const,
    positionsReferencedForbidden: true as const,
    licensedLibraryNeverInvented: true as const,
    emptyCatalogRefuses: true as const,
    refuseReasons: COACH_REFUSE_REASONS,
    userMessageKey: COACH_REFUSE_COPY,
    allowedTasks: [] as const,
    inventsLibraryTitles: false as const,
    inventsLessonBodies: false as const,
    inventsPositions: false as const,
    inventsTradeRecommendations: false as const,
  };
}
