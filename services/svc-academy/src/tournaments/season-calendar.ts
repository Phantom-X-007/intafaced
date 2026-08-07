/**
 * Tournament Stage-3 — seasonal ladder calendar (non-money).
 *
 * Pure window checks for scheduled/live seasons. No IFC, no prize pools.
 * Pair with prize-refuse.ts — calendar never implies payout readiness.
 */

import type { SeasonRecord, SeasonStatus } from './ladder.js';
import { TournamentError } from './ladder.js';
import { assertNoPrizeAttachment, refuseFundPrizePool, type PrizeDecision } from './prize-refuse.js';

export type SeasonWindow = {
  readonly seasonId: string;
  readonly status: SeasonStatus;
  readonly startsAt: Date;
  readonly endsAt: Date | null;
  readonly openAt: Date;
  /** True when openAt is inside [startsAt, endsAt) (null endsAt = open-ended). */
  readonly inWindow: boolean;
  /** Scores may write only when live AND in window. */
  readonly scoreWindowOpen: boolean;
};

/**
 * Build calendar window for one season. Missing id → throw (never invent season).
 */
export function seasonWindowAt(season: SeasonRecord, at: Date = new Date()): SeasonWindow {
  if (!season.id?.trim()) {
    throw new TournamentError('seasonId required for calendar window', 'academy.season_invalid');
  }
  assertNoPrizeAttachment(season);
  const startsAt = season.startsAt;
  const endsAt = season.endsAt;
  const t = at.getTime();
  const afterStart = t >= startsAt.getTime();
  const beforeEnd = endsAt == null || t < endsAt.getTime();
  const inWindow = afterStart && beforeEnd;
  return {
    seasonId: season.id,
    status: season.status,
    startsAt,
    endsAt,
    openAt: at,
    inWindow,
    scoreWindowOpen: season.status === 'live' && inWindow,
  };
}

/** Seasons whose score window is open at `at`. Empty → []. */
export function listScoreWindowOpenSeasons(seasons: readonly SeasonRecord[], at: Date = new Date()): readonly SeasonRecord[] {
  return seasons.filter((s) => seasonWindowAt(s, at).scoreWindowOpen);
}

/** Seasons currently inside their calendar window (any status). Empty → []. */
export function listSeasonsInCalendarWindow(seasons: readonly SeasonRecord[], at: Date = new Date()): readonly SeasonRecord[] {
  return seasons.filter((s) => seasonWindowAt(s, at).inWindow);
}

/**
 * Attempt to open a prize fund because a season calendar closed — always refuse.
 * Calendar end never invents IFC pools.
 */
export function refusePrizeOnSeasonClose(_season: SeasonRecord): PrizeDecision {
  assertNoPrizeAttachment(_season);
  return refuseFundPrizePool();
}

/** Count of seasons with score window open. Empty → 0. */
export function scoreWindowOpenCount(seasons: readonly SeasonRecord[], at: Date = new Date()): number {
  return listScoreWindowOpenSeasons(seasons, at).length;
}

/** True when season has ended calendar window (endsAt set and at >= endsAt). */
export function isSeasonCalendarEnded(season: SeasonRecord, at: Date = new Date()): boolean {
  if (season.endsAt == null) return false;
  return at.getTime() >= season.endsAt.getTime();
}
