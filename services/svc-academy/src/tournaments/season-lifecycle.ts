/**
 * Tournament Stage-2 — season lifecycle admin (non-money).
 *
 * Spec: prize pools = Class M (NOT here). This slice only advances season
 * status: scheduled → live → frozen → ended. Score writes still gated by
 * assertMayWriteScore (live only). Freeze may capture an immutable ranked
 * snapshot for operator audit — still zero money fields.
 */

import type { RankedStanding, SeasonRecord, SeasonStatus, StandingRecord } from './ladder.js';
import { rankStandings, TournamentError } from './ladder.js';

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

/** Freeze may only be taken from a live season (same edge as transitionSeason). */
export function assertMayFreeze(status: SeasonStatus): void {
  if (status !== 'live') {
    throw new TournamentError(`Cannot freeze snapshot from status ${status} — season must be live`, 'academy.season_invalid');
  }
}

/**
 * Immutable standings snapshot at freeze time.
 * No prize amount, no IFC, no payout flags — rank + score only for audit UI.
 */
export type FreezeStandingsSnapshot = {
  readonly seasonId: string;
  readonly frozenAt: Date;
  readonly standings: readonly RankedStanding[];
};

/**
 * Capture ranked standings for freeze. Caller still must transitionSeason → frozen.
 * Does not invent empty winners — empty standings list is allowed (no entries yet).
 */
export function snapshotStandingsAtFreeze(input: {
  seasonId: string;
  status: SeasonStatus;
  rows: readonly StandingRecord[];
  frozenAt?: Date;
}): FreezeStandingsSnapshot {
  assertMayFreeze(input.status);
  if (!input.seasonId?.trim()) {
    throw new TournamentError('seasonId required for freeze snapshot', 'academy.season_invalid');
  }
  const forSeason = input.rows.filter((r) => r.seasonId === input.seasonId);
  return {
    seasonId: input.seasonId,
    frozenAt: input.frozenAt ?? new Date(),
    standings: rankStandings(forSeason),
  };
}

/**
 * Live → frozen in one pure step with optional snapshot.
 * Still no money; snapshot is rank table only.
 */
export function freezeSeasonWithSnapshot(
  season: SeasonRecord,
  rows: readonly StandingRecord[],
  frozenAt?: Date,
): { season: SeasonRecord; snapshot: FreezeStandingsSnapshot } {
  assertMayFreeze(season.status);
  const snapshot = snapshotStandingsAtFreeze({
    seasonId: season.id,
    status: season.status,
    rows,
    frozenAt,
  });
  return {
    season: transitionSeason(season, 'frozen'),
    snapshot,
  };
}

/**
 * L3 — season status histogram for operator boards.
 * Empty input → zeros (no invented seasons).
 */
export type SeasonStatusHistogram = {
  readonly scheduled: number;
  readonly live: number;
  readonly frozen: number;
  readonly ended: number;
  readonly total: number;
  readonly scoreWritable: number;
};

export function countSeasonsByStatus(seasons: readonly SeasonRecord[]): SeasonStatusHistogram {
  let scheduled = 0;
  let live = 0;
  let frozen = 0;
  let ended = 0;
  for (const s of seasons) {
    if (s.status === 'scheduled') scheduled += 1;
    else if (s.status === 'live') live += 1;
    else if (s.status === 'frozen') frozen += 1;
    else if (s.status === 'ended') ended += 1;
  }
  return {
    scheduled,
    live,
    frozen,
    ended,
    total: scheduled + live + frozen + ended,
    scoreWritable: live,
  };
}

/**
 * L3 — seasons that still accept score writes (live only). Empty in → empty out.
 */
export function listScoreWritableSeasons(seasons: readonly SeasonRecord[]): readonly SeasonRecord[] {
  return seasons.filter((s) => isScoreWritable(s.status));
}

/** L3 — legal next statuses from current (operator UI). Ended → empty. */
export function allowedNextStatuses(status: SeasonStatus): readonly SeasonStatus[] {
  return ALLOWED[status];
}

/** L3 — filter seasons to one status. Empty if none (not invent). */
export function filterSeasonsByStatus(seasons: readonly SeasonRecord[], status: SeasonStatus): readonly SeasonRecord[] {
  return seasons.filter((s) => s.status === status);
}

/** L3 — ended is terminal (no further transitions). */
export function isSeasonTerminal(status: SeasonStatus): boolean {
  return status === 'ended';
}

/**
 * L3 — sorted season ids. Empty input → [] (never invent seasons).
 */
export function listSeasonIds(seasons: readonly SeasonRecord[]): readonly string[] {
  return seasons.map((s) => s.id).sort();
}

/** L3 — scheduled seasons only. Empty → []. */
export function listScheduledSeasons(seasons: readonly SeasonRecord[]): readonly SeasonRecord[] {
  return filterSeasonsByStatus(seasons, 'scheduled');
}

/** L3 — ended seasons only. Empty → []. */
export function listEndedSeasons(seasons: readonly SeasonRecord[]): readonly SeasonRecord[] {
  return filterSeasonsByStatus(seasons, 'ended');
}

/** L3 — frozen seasons only. Empty → []. */
export function listFrozenSeasons(seasons: readonly SeasonRecord[]): readonly SeasonRecord[] {
  return filterSeasonsByStatus(seasons, 'frozen');
}

/** L3 — sorted live season ids. Empty → []. */
export function listLiveSeasonIds(seasons: readonly SeasonRecord[]): readonly string[] {
  return listSeasonIds(filterSeasonsByStatus(seasons, 'live'));
}

/** L3 — live season records only. Empty → []. */
export function listLiveSeasons(seasons: readonly SeasonRecord[]): readonly SeasonRecord[] {
  return filterSeasonsByStatus(seasons, 'live');
}

/** L3 — sorted scheduled season ids. Empty → []. */
export function listScheduledSeasonIds(seasons: readonly SeasonRecord[]): readonly string[] {
  return listSeasonIds(filterSeasonsByStatus(seasons, 'scheduled'));
}

/** L3 — sorted ended season ids. Empty → []. */
export function listEndedSeasonIds(seasons: readonly SeasonRecord[]): readonly string[] {
  return listSeasonIds(filterSeasonsByStatus(seasons, 'ended'));
}

/** L3 — sorted frozen season ids. Empty → []. */
export function listFrozenSeasonIds(seasons: readonly SeasonRecord[]): readonly string[] {
  return listSeasonIds(filterSeasonsByStatus(seasons, 'frozen'));
}

/** L3 — count of live seasons. Empty → 0. */
export function liveSeasonCount(seasons: readonly SeasonRecord[]): number {
  return filterSeasonsByStatus(seasons, 'live').length;
}

/** L3 — count of frozen seasons. Empty → 0. */
export function frozenSeasonCount(seasons: readonly SeasonRecord[]): number {
  return filterSeasonsByStatus(seasons, 'frozen').length;
}

/** L3 — count of ended seasons. Empty → 0. */
export function endedSeasonCount(seasons: readonly SeasonRecord[]): number {
  return filterSeasonsByStatus(seasons, 'ended').length;
}

/** L3 — true when at least one season is live. Empty → false. */
export function hasLiveSeason(seasons: readonly SeasonRecord[]): boolean {
  return liveSeasonCount(seasons) > 0;
}

/** L3 — count of scheduled seasons. Empty → 0. */
export function scheduledSeasonCount(seasons: readonly SeasonRecord[]): number {
  return filterSeasonsByStatus(seasons, 'scheduled').length;
}

/** L3 — true when at least one season is frozen. Empty → false. */
export function hasFrozenSeason(seasons: readonly SeasonRecord[]): boolean {
  return frozenSeasonCount(seasons) > 0;
}

/** L3 — true when at least one season is ended. Empty → false. */
export function hasEndedSeason(seasons: readonly SeasonRecord[]): boolean {
  return endedSeasonCount(seasons) > 0;
}

/** L3 — true when at least one season is scheduled. Empty → false. */
export function hasScheduledSeason(seasons: readonly SeasonRecord[]): boolean {
  return scheduledSeasonCount(seasons) > 0;
}

/** L3 — total season records. Empty → 0. */
export function totalSeasonCount(seasons: readonly SeasonRecord[]): number {
  return seasons.length;
}

/** L3 — true when any season is terminal (ended). Empty → false. */
export function hasTerminalSeason(seasons: readonly SeasonRecord[]): boolean {
  return seasons.some((s) => isSeasonTerminal(s.status));
}

/** L3 — count of score-writable (live) seasons. Empty → 0. */
export function scoreWritableSeasonCount(seasons: readonly SeasonRecord[]): number {
  return listScoreWritableSeasons(seasons).length;
}

/**
 * L3 — live/total as fixed 4dp. Empty → null (never invent 0 live).
 */
export function liveSeasonRatio(seasons: readonly SeasonRecord[]): string | null {
  if (seasons.length === 0) return null;
  return (liveSeasonCount(seasons) / seasons.length).toFixed(4);
}

/** L3 — true when seasons list is empty. */
export function isSeasonListEmpty(seasons: readonly SeasonRecord[]): boolean {
  return seasons.length === 0;
}

/** L3 — frozen/total as fixed 4dp. Empty → null. */
export function frozenSeasonRatio(seasons: readonly SeasonRecord[]): string | null {
  if (seasons.length === 0) return null;
  return (frozenSeasonCount(seasons) / seasons.length).toFixed(4);
}

/** L3 — ended/total as fixed 4dp. Empty → null. */
export function endedSeasonRatio(seasons: readonly SeasonRecord[]): string | null {
  if (seasons.length === 0) return null;
  return (endedSeasonCount(seasons) / seasons.length).toFixed(4);
}

/** L3 — scheduled/total as fixed 4dp. Empty → null. */
export function scheduledSeasonRatio(seasons: readonly SeasonRecord[]): string | null {
  if (seasons.length === 0) return null;
  return (scheduledSeasonCount(seasons) / seasons.length).toFixed(4);
}

/** L3 — true when every season is ended. Empty → false (not invent all-ended). */
export function allSeasonsEnded(seasons: readonly SeasonRecord[]): boolean {
  if (seasons.length === 0) return false;
  return seasons.every((s) => s.status === 'ended');
}

/** L3 — non-terminal season count (not ended). Empty → 0. */
export function openSeasonCount(seasons: readonly SeasonRecord[]): number {
  return seasons.filter((s) => !isSeasonTerminal(s.status)).length;
}

/** L3 — true when any season is score-writable. Empty → false. */
export function hasScoreWritableSeason(seasons: readonly SeasonRecord[]): boolean {
  return scoreWritableSeasonCount(seasons) > 0;
}

/**
 * L3 — open (non-ended)/total as fixed 4dp. Empty → null.
 */
export function openSeasonRatio(seasons: readonly SeasonRecord[]): string | null {
  if (seasons.length === 0) return null;
  return (openSeasonCount(seasons) / seasons.length).toFixed(4);
}

/** L3 — sorted ids of score-writable seasons. Empty → []. */
export function listScoreWritableSeasonIds(seasons: readonly SeasonRecord[]): readonly string[] {
  return listSeasonIds(listScoreWritableSeasons(seasons));
}

/** L3 — true when every season is live. Empty → false. */
export function allSeasonsLive(seasons: readonly SeasonRecord[]): boolean {
  if (seasons.length === 0) return false;
  return seasons.every((s) => s.status === 'live');
}

/** L3 — true when every season is scheduled. Empty → false. */
export function allSeasonsScheduled(seasons: readonly SeasonRecord[]): boolean {
  if (seasons.length === 0) return false;
  return seasons.every((s) => s.status === 'scheduled');
}

/** L3 — true when every season is frozen. Empty → false. */
export function allSeasonsFrozen(seasons: readonly SeasonRecord[]): boolean {
  if (seasons.length === 0) return false;
  return seasons.every((s) => s.status === 'frozen');
}

/** L3 — distinct status count present. Empty → 0. */
export function distinctSeasonStatusCount(seasons: readonly SeasonRecord[]): number {
  return new Set(seasons.map((s) => s.status)).size;
}

/** L3 — true when season list has at least n entries. */
export function hasAtLeastSeasons(seasons: readonly SeasonRecord[], n: number): boolean {
  if (!Number.isFinite(n) || n < 0) return false;
  return seasons.length >= Math.floor(n);
}

/** L3 — first season id (sorted). Empty → null. */
export function firstSeasonId(seasons: readonly SeasonRecord[]): string | null {
  const ids = listSeasonIds(seasons);
  return ids[0] ?? null;
}

/** L3 — last season id (sorted). Empty → null. */
export function lastSeasonId(seasons: readonly SeasonRecord[]): string | null {
  const ids = listSeasonIds(seasons);
  return ids.length ? ids[ids.length - 1]! : null;
}

/** L3 — true when statuses mix at least 2 distinct. Empty → false. */
export function hasMixedSeasonStatuses(seasons: readonly SeasonRecord[]): boolean {
  return distinctSeasonStatusCount(seasons) >= 2;
}

/** L3 — season count label. */
export function seasonCountLabel(seasons: readonly SeasonRecord[]): string {
  return String(seasons.length);
}

/** L3 — live count label. */
export function liveSeasonCountLabel(seasons: readonly SeasonRecord[]): string {
  return String(liveSeasonCount(seasons));
}

/** L3 — comma-joined season ids. Empty → "". */
export function seasonIdsJoined(seasons: readonly SeasonRecord[]): string {
  return listSeasonIds(seasons).join(',');
}

/** L3 — comma-joined live season ids. Empty → "". */
export function liveSeasonIdsJoined(seasons: readonly SeasonRecord[]): string {
  return listLiveSeasonIds(seasons).join(',');
}
