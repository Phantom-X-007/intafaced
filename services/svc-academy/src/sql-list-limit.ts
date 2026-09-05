import { AcademyError, type AcademyErrorCode } from './errors.js';

/** Owner-published SQL page size. Blank / non-finite / <1 refuses. Never invent 50. */
function assertSqlListLimit(limit: number | null | undefined, code: AcademyErrorCode, label: string): number {
  if (limit === undefined || limit === null || typeof limit !== 'number' || !Number.isFinite(limit)) {
    throw new AcademyError(`${label} list limit is unset — pass limit (never invent the whole table)`, code);
  }
  const n = Math.floor(limit);
  if (n < 1) {
    throw new AcademyError(`${label} list limit is unset — pass limit (never invent the whole table)`, code);
  }
  return Math.min(200, n);
}

export function assertRoomsListLimit(limit: number | null | undefined): number {
  return assertSqlListLimit(limit, 'academy.rooms_list_limit_unset', 'Rooms');
}

export function assertSessionsListLimit(limit: number | null | undefined): number {
  return assertSqlListLimit(limit, 'academy.sessions_list_limit_unset', 'Sessions');
}

export function assertSeasonsSqlListLimit(limit: number | null | undefined): number {
  return assertSqlListLimit(limit, 'academy.seasons_list_limit_unset', 'Seasons');
}

export function assertOpenResidenciesListLimit(limit: number | null | undefined): number {
  return assertSqlListLimit(limit, 'academy.open_residencies_list_limit_unset', 'Open residencies');
}
