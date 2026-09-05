import { AcademyError } from '../errors.js';

/** Owner-published ambassadors page size. Blank / non-finite / <1 refuses. Never invent 50. */
export function assertAmbassadorsListLimit(limit: number | null | undefined): number {
  if (limit === undefined || limit === null || typeof limit !== 'number' || !Number.isFinite(limit)) {
    throw new AcademyError(
      'Ambassadors list limit is unset — pass limit (never invent the whole table)',
      'academy.ambassadors_list_limit_unset',
    );
  }
  const n = Math.floor(limit);
  if (n < 1) {
    throw new AcademyError(
      'Ambassadors list limit is unset — pass limit (never invent the whole table)',
      'academy.ambassadors_list_limit_unset',
    );
  }
  return Math.min(200, n);
}
