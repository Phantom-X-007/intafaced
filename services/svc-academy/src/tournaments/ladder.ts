/**
 * TOURNAMENT LADDERS — Stage-1 without money (TRK-academy.tournaments).
 *
 * Seasons + standings only. NO prize pools, NO ledger, NO IFC payouts.
 * Stage-2 Class M owns fund/payout recipes.
 *
 * Anti-cheat basics (Stage-1):
 *   · score is a non-negative integer set by operator (or paper source later)
 *   · rank is derived from (score DESC, updated_at ASC) — no silent re-rank
 *     after freeze without a new season
 *   · frozen seasons refuse score writes
 */

export type SeasonStatus = 'scheduled' | 'live' | 'frozen' | 'ended';

export interface SeasonRecord {
  id: string;
  slug: string;
  title: string;
  status: SeasonStatus;
  rulesSummary: string;
  startsAt: Date;
  endsAt: Date | null;
}

export interface StandingRecord {
  seasonId: string;
  userId: string;
  score: number;
  updatedAt: Date;
}

export interface RankedStanding extends StandingRecord {
  rank: number;
}

export type TournamentErrorCode =
  | 'academy.tournament_disabled'
  | 'academy.season_not_found'
  | 'academy.season_not_live'
  | 'academy.season_invalid'
  | 'academy.standing_invalid';

export class TournamentError extends Error {
  constructor(
    message: string,
    readonly code: TournamentErrorCode,
  ) {
    super(message);
    this.name = 'TournamentError';
  }
}

/** Pure: order standings into ranks (1-based). Stable on equal score by earlier update wins? Spec: score DESC, updated_at ASC (first to score keeps rank). */
export function rankStandings(rows: readonly StandingRecord[]): RankedStanding[] {
  const sorted = [...rows].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.updatedAt.getTime() - b.updatedAt.getTime();
  });
  return sorted.map((r, i) => ({ ...r, rank: i + 1 }));
}

export function assertSeasonSlug(slug: string): string {
  const s = slug.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(s)) {
    throw new TournamentError('Season slug must be 3–64 chars, lowercase alphanumeric + hyphen', 'academy.season_invalid');
  }
  return s;
}

export function assertScore(score: number): number {
  if (!Number.isInteger(score) || score < 0 || score > 1_000_000_000) {
    throw new TournamentError('Score must be an integer 0…1e9', 'academy.standing_invalid');
  }
  return score;
}

export function assertMayWriteScore(status: SeasonStatus): void {
  if (status !== 'live') {
    throw new TournamentError(`Season is ${status} — scores only write while live`, 'academy.season_not_live');
  }
}

/**
 * L3 — pure standings page for operator/UI.
 * offset/limit clamp; never invent rows past the ranked list.
 */
export type StandingsPage = {
  readonly total: number;
  readonly offset: number;
  readonly limit: number;
  readonly standings: readonly RankedStanding[];
};

export function pageStandings(rows: readonly StandingRecord[], options: { offset?: number; limit?: number } = {}): StandingsPage {
  const ranked = rankStandings(rows);
  const total = ranked.length;
  const offset = Math.max(0, Math.floor(options.offset ?? 0));
  const limit = Math.min(200, Math.max(1, Math.floor(options.limit ?? 50)));
  return {
    total,
    offset,
    limit,
    standings: ranked.slice(offset, offset + limit),
  };
}

/**
 * L3 — look up one user's rank. Missing user → null (never invent a standing).
 */
export function standingOfUser(rows: readonly StandingRecord[], userId: string): RankedStanding | null {
  const id = userId.trim();
  if (!id) return null;
  return rankStandings(rows).find((r) => r.userId === id) ?? null;
}

/**
 * L3 — top-N ranked standings. n≤0 → empty (never invent a podium).
 */
export function topNStandings(rows: readonly StandingRecord[], n: number): readonly RankedStanding[] {
  const limit = Math.floor(n);
  if (limit <= 0) return [];
  return rankStandings(rows).slice(0, limit);
}

/**
 * L3 — rank neighbors for UI (self + optional above/below).
 * Missing user → null (never invent a place on the ladder).
 */
export type StandingNeighbors = {
  readonly self: RankedStanding;
  readonly above: RankedStanding | null;
  readonly below: RankedStanding | null;
};

export function standingNeighbors(rows: readonly StandingRecord[], userId: string): StandingNeighbors | null {
  const ranked = rankStandings(rows);
  const idx = ranked.findIndex((r) => r.userId === userId.trim());
  if (idx < 0) return null;
  return {
    self: ranked[idx]!,
    above: idx > 0 ? ranked[idx - 1]! : null,
    below: idx < ranked.length - 1 ? ranked[idx + 1]! : null,
  };
}

/**
 * L3 — score for one user. Missing → null (never invent 0 as a standing).
 */
export function scoreOfUser(rows: readonly StandingRecord[], userId: string): number | null {
  const id = userId.trim();
  if (!id) return null;
  const row = rows.find((r) => r.userId === id);
  return row ? row.score : null;
}

/**
 * L3 — how many standings strictly above a score (for percentile UI).
 * Empty rows → 0.
 */
export function countStandingsAboveScore(rows: readonly StandingRecord[], score: number): number {
  if (!Number.isFinite(score)) return 0;
  return rows.filter((r) => r.score > score).length;
}

/**
 * L3 — standing count (empty → 0). Never invents competitors.
 */
export function standingCount(rows: readonly StandingRecord[]): number {
  return rows.length;
}

/**
 * L3 — bottom-N ranked standings (lowest scores). n≤0 → empty (never invent).
 */
export function bottomNStandings(rows: readonly StandingRecord[], n: number): readonly RankedStanding[] {
  const limit = Math.floor(n);
  if (limit <= 0) return [];
  const ranked = rankStandings(rows);
  return ranked.slice(Math.max(0, ranked.length - limit));
}

/**
 * L3 — median score among rows. Empty → null (never invent 0 as a score).
 */
export function medianScore(rows: readonly StandingRecord[]): number | null {
  if (rows.length === 0) return null;
  const scores = rows.map((r) => r.score).sort((a, b) => a - b);
  const mid = Math.floor(scores.length / 2);
  if (scores.length % 2 === 1) return scores[mid]!;
  return (scores[mid - 1]! + scores[mid]!) / 2;
}

/**
 * L3 — true when user is in top-N (rank ≤ n). Missing user → false (never invent podium).
 */
export function isInTopN(rows: readonly StandingRecord[], userId: string, n: number): boolean {
  const limit = Math.floor(n);
  if (limit <= 0) return false;
  const s = standingOfUser(rows, userId);
  return s != null && s.rank <= limit;
}

/**
 * L3 — max score among rows. Empty → null (never invent 0).
 */
export function maxScore(rows: readonly StandingRecord[]): number | null {
  if (rows.length === 0) return null;
  let max = rows[0]!.score;
  for (const r of rows) {
    if (r.score > max) max = r.score;
  }
  return max;
}

/**
 * L3 — min score among rows. Empty → null (never invent 0).
 */
export function minScore(rows: readonly StandingRecord[]): number | null {
  if (rows.length === 0) return null;
  let min = rows[0]!.score;
  for (const r of rows) {
    if (r.score < min) min = r.score;
  }
  return min;
}

/**
 * L3 — distinct user ids in standings (sorted). Empty → [].
 */
export function listStandingUserIds(rows: readonly StandingRecord[]): readonly string[] {
  return [...new Set(rows.map((r) => r.userId))].sort();
}

/**
 * L3 — arithmetic mean score. Empty → null (never invent 0).
 */
export function averageScore(rows: readonly StandingRecord[]): number | null {
  if (rows.length === 0) return null;
  let sum = 0;
  for (const r of rows) sum += r.score;
  return sum / rows.length;
}

/**
 * L3 — max score minus min score. Empty or single → null (never invent spread).
 */
export function scoreSpread(rows: readonly StandingRecord[]): number | null {
  if (rows.length < 2) return null;
  let min = rows[0]!.score;
  let max = rows[0]!.score;
  for (const r of rows) {
    if (r.score < min) min = r.score;
    if (r.score > max) max = r.score;
  }
  return max - min;
}

/**
 * L3 — score range (max−min). Empty/single → null (same law as scoreSpread).
 */
export function scoreRange(rows: readonly StandingRecord[]): number | null {
  return scoreSpread(rows);
}

/**
 * L3 — true when user has a standing row. Missing → false (never invent).
 */
export function hasStanding(rows: readonly StandingRecord[], userId: string): boolean {
  const id = userId.trim();
  if (!id) return false;
  return rows.some((r) => r.userId === id);
}

/**
 * L3 — rank for one user (1-based). Missing → null (never invent place).
 */
export function rankOfUser(rows: readonly StandingRecord[], userId: string): number | null {
  const s = standingOfUser(rows, userId);
  return s?.rank ?? null;
}

/**
 * L3 — true when user has the unique top score (rank 1). Missing → false.
 */
export function isTopScorer(rows: readonly StandingRecord[], userId: string): boolean {
  return rankOfUser(rows, userId) === 1;
}

/**
 * L3 — user id at rank 2. Missing podium → null (never invent second place).
 */
export function secondPlaceUser(rows: readonly StandingRecord[]): string | null {
  const ranked = rankStandings(rows);
  return ranked[1]?.userId ?? null;
}

/**
 * L3 — user id at rank 3. Missing → null (never invent third place).
 */
export function thirdPlaceUser(rows: readonly StandingRecord[]): string | null {
  const ranked = rankStandings(rows);
  return ranked[2]?.userId ?? null;
}

/**
 * L3 — last-ranked user id (lowest score podium). Empty → null.
 */
export function lastPlaceUser(rows: readonly StandingRecord[]): string | null {
  const ranked = rankStandings(rows);
  if (ranked.length === 0) return null;
  return ranked[ranked.length - 1]!.userId;
}

/**
 * L3 — user id at rank 1. Empty standings → null (never invent podium).
 */
export function firstPlaceUser(rows: readonly StandingRecord[]): string | null {
  const ranked = rankStandings(rows);
  return ranked[0]?.userId ?? null;
}

/**
 * L3 — score at 1-based rank. Missing rank → null (never invent score).
 */
export function scoreAtRank(rows: readonly StandingRecord[], rank: number): number | null {
  if (!Number.isFinite(rank) || rank < 1) return null;
  const ranked = rankStandings(rows);
  const i = Math.floor(rank) - 1;
  return ranked[i]?.score ?? null;
}

/**
 * L3 — user id at 1-based rank. Missing rank → null (never invent podium seat).
 */
export function userAtRank(rows: readonly StandingRecord[], rank: number): string | null {
  if (!Number.isFinite(rank) || rank < 1) return null;
  const ranked = rankStandings(rows);
  const i = Math.floor(rank) - 1;
  return ranked[i]?.userId ?? null;
}

/**
 * L3 — top-3 user ids in rank order. Fewer than 3 → shorter list; empty → [].
 */
export function podiumUserIds(rows: readonly StandingRecord[]): readonly string[] {
  return topNStandings(rows, 3).map((r) => r.userId);
}

/**
 * L3 — true when standings input is empty.
 */
export function isEmptyStandings(rows: readonly StandingRecord[]): boolean {
  return rows.length === 0;
}

/**
 * L3 — true when standings has at least one row.
 */
export function hasAnyStanding(rows: readonly StandingRecord[]): boolean {
  return rows.length > 0;
}

/**
 * L3 — user id at last rank (alias surface of lastPlaceUser). Empty → null.
 */
export function bottomUser(rows: readonly StandingRecord[]): string | null {
  return lastPlaceUser(rows);
}

/**
 * L3 — scores in rank order (DESC). Empty → [].
 */
export function scoresInRankOrder(rows: readonly StandingRecord[]): readonly number[] {
  return rankStandings(rows).map((r) => r.score);
}

/**
 * L3 — true when podium has at least n ranked users. Empty → false.
 */
export function hasPodiumDepth(rows: readonly StandingRecord[], n: number): boolean {
  if (!Number.isFinite(n) || n < 1) return false;
  return rankStandings(rows).length >= Math.floor(n);
}

/**
 * L3 — rank count (same as standingCount after rank). Empty → 0.
 */
export function rankedCount(rows: readonly StandingRecord[]): number {
  return rankStandings(rows).length;
}

/**
 * L3 — average of top-N scores. Empty or n invalid → null.
 */
export function averageTopNScore(rows: readonly StandingRecord[], n: number): number | null {
  if (!Number.isFinite(n) || n < 1) return null;
  const top = topNStandings(rows, Math.floor(n));
  if (top.length === 0) return null;
  const sum = top.reduce((a, r) => a + r.score, 0);
  return sum / top.length;
}

/**
 * L3 — true when user score equals max score. Missing → false.
 */
export function isTiedForFirst(rows: readonly StandingRecord[], userId: string): boolean {
  const max = maxScore(rows);
  if (max === null) return false;
  const s = scoreOfUser(rows, userId);
  return s !== null && s === max;
}

/**
 * L3 — count of users with score strictly above threshold. Empty → 0.
 */
export function countAboveScore(rows: readonly StandingRecord[], score: number): number {
  return countStandingsAboveScore(rows, score);
}

/** L3 — true when standings has unique first place (no tie at max). Empty → false. */
export function hasUniqueLeader(rows: readonly StandingRecord[]): boolean {
  if (rows.length === 0) return false;
  const max = maxScore(rows);
  if (max === null) return false;
  return rows.filter((r) => r.score === max).length === 1;
}

/**
 * L3 — gap between first and second score. Need ≥2 → null otherwise.
 */
export function firstSecondScoreGap(rows: readonly StandingRecord[]): number | null {
  const ranked = rankStandings(rows);
  if (ranked.length < 2) return null;
  return ranked[0]!.score - ranked[1]!.score;
}

/**
 * L3 — user ids tied at max score (sorted). Empty → [].
 */
export function tiedForLeadUserIds(rows: readonly StandingRecord[]): readonly string[] {
  const max = maxScore(rows);
  if (max === null) return [];
  return rows
    .filter((r) => r.score === max)
    .map((r) => r.userId)
    .sort();
}

/** L3 — true when score range is zero (all equal). Empty → false. */
export function allScoresEqual(rows: readonly StandingRecord[]): boolean {
  const spread = scoreSpread(rows);
  return spread !== null && spread === 0;
}

/**
 * L3 — rank depth needed to cover top score mass of at least k users. Empty → null.
 */
export function minRankForTopK(rows: readonly StandingRecord[], k: number): number | null {
  if (!Number.isFinite(k) || k < 1) return null;
  const ranked = rankStandings(rows);
  if (ranked.length < Math.floor(k)) return null;
  return ranked[Math.floor(k) - 1]!.rank;
}

/**
 * L3 — second-to-third score gap. Need ≥3 ranks → null otherwise.
 */
export function secondThirdScoreGap(rows: readonly StandingRecord[]): number | null {
  const ranked = rankStandings(rows);
  if (ranked.length < 3) return null;
  return ranked[1]!.score - ranked[2]!.score;
}

/**
 * L3 — users with score strictly below threshold (sorted ids). Empty → [].
 */
export function userIdsBelowScore(rows: readonly StandingRecord[], score: number): readonly string[] {
  return rows
    .filter((r) => r.score < score)
    .map((r) => r.userId)
    .sort();
}

/**
 * L3 — users with score at or above threshold (sorted ids). Empty → [].
 */
export function userIdsAtOrAboveScore(rows: readonly StandingRecord[], score: number): readonly string[] {
  return rows
    .filter((r) => r.score >= score)
    .map((r) => r.userId)
    .sort();
}

/** L3 — true when top two scores differ. Need ≥2 → false otherwise. */
export function hasClearLeader(rows: readonly StandingRecord[]): boolean {
  const gap = firstSecondScoreGap(rows);
  return gap !== null && gap > 0;
}

/**
 * L3 — last-to-second-last score gap. Need ≥2 → null otherwise.
 */
export function lastTwoScoreGap(rows: readonly StandingRecord[]): number | null {
  const ranked = rankStandings(rows);
  if (ranked.length < 2) return null;
  const a = ranked[ranked.length - 2]!.score;
  const b = ranked[ranked.length - 1]!.score;
  return a - b;
}

/** L3 — true when standings count is at least n. */
export function hasAtLeastStandings(rows: readonly StandingRecord[], n: number): boolean {
  if (!Number.isFinite(n) || n < 0) return false;
  return rows.length >= Math.floor(n);
}

/**
 * L3 — mid-rank user id (1-based rank ceil(n/2)). Empty → null.
 */
export function midRankUser(rows: readonly StandingRecord[]): string | null {
  const ranked = rankStandings(rows);
  if (ranked.length === 0) return null;
  const i = Math.ceil(ranked.length / 2) - 1;
  return ranked[i]?.userId ?? null;
}

/** L3 — sum of all scores. Empty → 0 (no invent average). */
export function totalScoreSum(rows: readonly StandingRecord[]): number {
  return rows.reduce((a, r) => a + r.score, 0);
}

/** L3 — standing count label. */
export function standingCountLabel(rows: readonly StandingRecord[]): string {
  return String(standingCount(rows));
}

/** L3 — max score label or empty when missing. */
export function maxScoreLabel(rows: readonly StandingRecord[]): string {
  const m = maxScore(rows);
  return m === null ? '' : String(m);
}

/** L3 — min score label or empty when missing. */
export function minScoreLabel(rows: readonly StandingRecord[]): string {
  const m = minScore(rows);
  return m === null ? '' : String(m);
}

/**
 * L3 — comma-joined user ids in rank order. Empty → "".
 */
export function rankedUserIdsJoined(rows: readonly StandingRecord[]): string {
  return rankStandings(rows)
    .map((r) => r.userId)
    .join(',');
}

/** L3 — scores in rank order joined. Empty → "". */
export function scoresInRankOrderJoined(rows: readonly StandingRecord[]): string {
  return scoresInRankOrder(rows).join(',');
}

/** L3 — podium user ids joined. Empty → "". */
export function podiumUserIdsJoined(rows: readonly StandingRecord[]): string {
  return podiumUserIds(rows).join(',');
}

/** L3 — standing user ids joined (unsorted source order). Empty → "". */
export function standingUserIdsJoined(rows: readonly StandingRecord[]): string {
  return listStandingUserIds(rows).join(',');
}

/** L3 — average score label or empty. */
export function averageScoreLabel(rows: readonly StandingRecord[]): string {
  const a = averageScore(rows);
  return a === null ? '' : String(a);
}

/** L3 — first place user label or empty. */
export function firstPlaceUserLabel(rows: readonly StandingRecord[]): string {
  return firstPlaceUser(rows) ?? '';
}

/** L3 — last place user label or empty. */
export function lastPlaceUserLabel(rows: readonly StandingRecord[]): string {
  return lastPlaceUser(rows) ?? '';
}

/** L3 — mid rank user label or empty. */
export function midRankUserLabel(rows: readonly StandingRecord[]): string {
  return midRankUser(rows) ?? '';
}

/** L3 — score spread label or empty. */
export function scoreSpreadLabel(rows: readonly StandingRecord[]): string {
  const s = scoreSpread(rows);
  return s === null ? '' : String(s);
}
