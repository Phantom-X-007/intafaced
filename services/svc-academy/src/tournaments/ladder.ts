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
