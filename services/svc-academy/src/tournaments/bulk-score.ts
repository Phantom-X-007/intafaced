/**
 * Tournament Stage-2 L3 — bulk score write validation (non-money).
 *
 * Operator may stage many score updates; pure gate refuses invalid rows
 * without inventing scores. Season must be live for any write.
 */

import { assertMayWriteScore, assertScore, TournamentError, type SeasonRecord, type SeasonStatus, type StandingRecord } from './ladder.js';
import { assertScoreWindowOpen } from './season-calendar.js';

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
 *
 * When `startsAt`/`endsAt` are provided (or a full season-shaped record), the
 * calendar window is enforced the same way as single-score writes.
 */
export function validateBulkScoreWrite(input: {
  seasonStatus: SeasonStatus;
  seasonId: string;
  patches: readonly ScorePatch[];
  /** Optional calendar bounds — when set, live-after-endsAt refuses. */
  startsAt?: Date;
  endsAt?: Date | null;
  now?: Date;
}): BulkScoreResult {
  try {
    assertMayWriteScore(input.seasonStatus);
  } catch (e) {
    const msg = e instanceof TournamentError ? e.message : 'Season not live';
    return { status: 'refuse', reason: 'season_not_live', message: msg };
  }
  if (input.startsAt !== undefined) {
    try {
      const season: SeasonRecord = {
        id: input.seasonId,
        slug: 'bulk-gate',
        title: 'bulk-gate',
        status: input.seasonStatus,
        rulesSummary: '',
        startsAt: input.startsAt,
        endsAt: input.endsAt ?? null,
      };
      assertScoreWindowOpen(season, input.now ?? new Date());
    } catch (e) {
      const msg = e instanceof TournamentError ? e.message : 'Season score window closed';
      return { status: 'refuse', reason: 'season_not_live', message: msg };
    }
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

/** L3 — pure ok check for bulk gate (no invent patches). */
export function isBulkScoreOk(result: BulkScoreResult): result is BulkScoreOk {
  return result.status === 'ok';
}

/**
 * L3 — accepted patch count from bulk result. Refuse → 0 (no invent).
 */
export function bulkAcceptedCount(result: BulkScoreResult): number {
  return result.status === 'ok' ? result.patches.length : 0;
}

/**
 * L3 — refuse reason or null when ok.
 */
export function bulkRefuseReason(result: BulkScoreResult): string | null {
  return result.status === 'ok' ? null : result.reason;
}

/** L3 — true when bulk write refused. */
export function isBulkScoreRefused(result: BulkScoreResult): boolean {
  return !isBulkScoreOk(result);
}

/** L3 — accepted count label. */
export function bulkAcceptedCountLabel(result: BulkScoreResult): string {
  return String(bulkAcceptedCount(result));
}

/** L3 — refuse reason label or empty. */
export function bulkRefuseReasonLabel(result: BulkScoreResult): string {
  return bulkRefuseReason(result) ?? '';
}

/** L3 — true when bulk ok with zero accepted (empty patch set allowed). */
export function isBulkScoreEmptyOk(result: BulkScoreResult): boolean {
  return isBulkScoreOk(result) && bulkAcceptedCount(result) === 0;
}

/** L3 — bulk score board card. */
export function bulkScoreBoardCard(result: BulkScoreResult): {
  readonly ok: boolean;
  readonly accepted: number;
  readonly refused: boolean;
  readonly reason: string | null;
  readonly emptyOk: boolean;
  readonly acceptedLabel: string;
  readonly reasonLabel: string;
} {
  return {
    ok: isBulkScoreOk(result),
    accepted: bulkAcceptedCount(result),
    refused: isBulkScoreRefused(result),
    reason: bulkRefuseReason(result),
    emptyOk: isBulkScoreEmptyOk(result),
    acceptedLabel: bulkAcceptedCountLabel(result),
    reasonLabel: bulkRefuseReasonLabel(result),
  };
}

/** L3 — bulk export header. */
export function bulkScoreExportHeader(): string {
  return 'status,accepted,reason';
}

/** L3 — bulk export line from result. */
export function bulkScoreExportLine(result: BulkScoreResult): string {
  const c = bulkScoreBoardCard(result);
  return `${c.ok ? 'ok' : 'refuse'},${c.accepted},${c.reason ?? ''}`;
}

/** L3 — full bulk export text. */
export function bulkScoreExportText(result: BulkScoreResult): string {
  return [bulkScoreExportHeader(), bulkScoreExportLine(result)].join('\n');
}

/** L3 — parse bulk export line. Invalid → null. */
export function parseBulkScoreExportLine(
  line: string,
): { readonly status: 'ok' | 'refuse'; readonly accepted: number; readonly reason: string } | null {
  const t = line.trim();
  if (!t || t === bulkScoreExportHeader()) return null;
  const parts = t.split(',');
  if (parts.length < 2) return null;
  const status = parts[0]!.trim();
  const accepted = Number(parts[1]);
  const reason = parts.slice(2).join(',').trim();
  if (status !== 'ok' && status !== 'refuse') return null;
  if (!Number.isFinite(accepted) || accepted < 0) return null;
  return { status, accepted: Math.floor(accepted), reason };
}

/** L3 — bulk score status line. */
export function bulkScoreStatusLine(result: BulkScoreResult): string {
  const c = bulkScoreBoardCard(result);
  return `ok=${c.ok ? '1' : '0'} accepted=${c.accepted} refused=${c.refused ? '1' : '0'}`;
}

/** L3 — true when accepted is 0 and ok. */
export function bulkScoreStatusLineIsEmptyOk(result: BulkScoreResult): boolean {
  return isBulkScoreEmptyOk(result);
}

/** L3 — parse bulk score status. Invalid → null. */
export function parseBulkScoreStatusLine(
  line: string,
): { readonly ok: boolean; readonly accepted: number; readonly refused: boolean } | null {
  const m = line.trim().match(/^ok=([01]) accepted=(\d+) refused=([01])$/);
  if (!m) return null;
  return { ok: m[1] === '1', accepted: Number(m[2]), refused: m[3] === '1' };
}

/** L3 — true when status matches result. */
export function bulkScoreStatusLineMatches(result: BulkScoreResult): boolean {
  const p = parseBulkScoreStatusLine(bulkScoreStatusLine(result));
  if (!p) return false;
  const c = bulkScoreBoardCard(result);
  return p.ok === c.ok && p.accepted === c.accepted && p.refused === c.refused;
}

/** L3 — true when accepted is within [min,max]. Invalid → false. */
export function bulkAcceptedInRange(result: BulkScoreResult, min: number, max: number): boolean {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) return false;
  const n = bulkAcceptedCount(result);
  return n >= min && n <= max;
}

/** L3 — true when accepted is at least n. */
export function bulkAcceptedAtLeast(result: BulkScoreResult, n: number): boolean {
  if (!Number.isFinite(n)) return false;
  return bulkAcceptedCount(result) >= n;
}

/** L3 — data-line count for bulk export text. */
export function countBulkScoreExportDataLines(text: string): number {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && l !== bulkScoreExportHeader()).length;
}

/** L3 — true when bulk export has header. */
export function bulkScoreExportHasHeader(text: string): boolean {
  const first = text.split('\n')[0]?.trim() ?? '';
  return first === bulkScoreExportHeader();
}

/** L3 — round-trip for bulk export. */
export function bulkScoreExportRoundTripOk(result: BulkScoreResult): boolean {
  const text = bulkScoreExportText(result);
  return text.split('\n').filter(Boolean).length === 1 + countBulkScoreExportDataLines(text);
}
