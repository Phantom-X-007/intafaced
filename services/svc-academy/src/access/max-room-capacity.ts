import { AcademyError } from '../errors.js';

/**
 * Owner-published lobby ceiling. Blank / non-integer / out of 1..100_000
 * refuses. Never invent 5000. Never clamp.
 */
export function assertPublishedMaxRoomCapacity(max: number | undefined): number {
  if (max === undefined || typeof max !== 'number' || !Number.isInteger(max) || max < 1 || max > 100_000) {
    throw new AcademyError(
      'Academy max room capacity is unset — set ACADEMY_MAX_ROOM_CAPACITY (never invent a ceiling)',
      'academy.room_capacity_unset',
    );
  }
  return max;
}
