/**
 * Tournament Stage-2 L3 — bulk score write validation (non-money).
 *
 * Operator may stage many score updates; pure gate refuses invalid rows
 * without inventing scores. Season must be live for any write.
 */

import { assertMayWriteScore, assertScore, TournamentError, type SeasonStatus, type StandingRecord } from './ladder.js';

export type ScorePatch = {
  readonly userId: string;
  readonly score: number;
};

export type BulkScoreOk = {
  readonly status: 'ok';
  readonly patches: readonly ScorePatch[];
};

export type BulkScoreRefuse = {
  readonly status: 'refuse';
  readonly reason: 'season_not_live' | 'empty' | 'invalid_row' | 'duplicate_user';
  readonly message: string;
  readonly badUserId?: string;
};

export type BulkScoreResult = BulkScoreOk | BulkScoreRefuse;

/**
 * Validate a bulk score patch list for a live season.
 * Does not write DB — caller applies after ok.
 */
export function validateBulkScoreWrite(input: {
  seasonStatus: SeasonStatus;
  seasonId: string;
  patches: readonly ScorePatch[];
}): BulkScoreResult {
  try {
    assertMayWriteScore(input.seasonStatus);
  } catch (e) {
    const msg = e instanceof TournamentError ? e.message : 'Season not live';
    return { status: 'refuse', reason: 'season_not_live', message: msg };
  }
  if (!input.patches.length) {
    return { status: 'refuse', reason: 'empty', message: 'No score patches — refuse invent empty bulk write' };
  }
  const seen = new Set<string>();
  const out: ScorePatch[] = [];
  for (const p of input.patches) {
    const userId = p.userId?.trim() ?? '';
    if (!userId || userId.length > 64) {
      return { status: 'refuse', reason: 'invalid_row', message: 'userId required (1–64)', badUserId: p.userId };
    }
    if (seen.has(userId)) {
      return { status: 'refuse', reason: 'duplicate_user', message: `Duplicate userId ${userId}`, badUserId: userId };
    }
    try {
      assertScore(p.score);
    } catch (e) {
      const msg = e instanceof TournamentError ? e.message : 'Invalid score';
      return { status: 'refuse', reason: 'invalid_row', message: msg, badUserId: userId };
    }
    seen.add(userId);
    out.push({ userId, score: p.score });
  }
  return { status: 'ok', patches: out };
}

/** Apply validated patches onto existing standings map (pure merge). */
export function applyBulkScorePatches(
  seasonId: string,
  existing: readonly StandingRecord[],
  patches: readonly ScorePatch[],
  now: Date = new Date(),
): StandingRecord[] {
  const byUser = new Map(existing.filter((r) => r.seasonId === seasonId).map((r) => [r.userId, r]));
  for (const p of patches) {
    byUser.set(p.userId, {
      seasonId,
      userId: p.userId,
      score: p.score,
      updatedAt: now,
    });
  }
  return [...byUser.values()];
}

/**
 * L3 — summarize a successful bulk result for operator boards.
 * Refuse results → zeros (never invent accepted patches).
 */
export type BulkScoreSummary = {
  readonly accepted: number;
  readonly refused: boolean;
  readonly reason: string | null;
};

export function summarizeBulkScoreResult(result: BulkScoreResult): BulkScoreSummary {
  if (result.status === 'ok') {
    return { accepted: result.patches.length, refused: false, reason: null };
  }
  return { accepted: 0, refused: true, reason: result.reason };
}
