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
