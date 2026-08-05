/**
 * Tournament Stage-2 — season lifecycle admin (non-money).
 *
 * Spec: prize pools = Class M (NOT here). This slice only advances season
 * status: scheduled → live → frozen → ended. Score writes still gated by
 * assertMayWriteScore (live only).
 */

import type { SeasonRecord, SeasonStatus } from './ladder.js';
import { TournamentError } from './ladder.js';

const ALLOWED: Readonly<Record<SeasonStatus, readonly SeasonStatus[]>> = {
  scheduled: ['live', 'ended'],
  live: ['frozen', 'ended'],
  frozen: ['ended', 'live'],
  ended: [],
};

/**
 * Transition season status. Invalid edges throw.
 * Ending a season does not invent prizes — payout is a separate Class M path.
 */
export function transitionSeason(season: SeasonRecord, next: SeasonStatus): SeasonRecord {
  const allowed = ALLOWED[season.status];
  if (!allowed.includes(next)) {
    throw new TournamentError(`Cannot move season from ${season.status} to ${next}`, 'academy.season_invalid');
  }
  return { ...season, status: next };
}

/** Pure: seasons an operator may still write scores for. */
export function isScoreWritable(status: SeasonStatus): boolean {
  return status === 'live';
}
