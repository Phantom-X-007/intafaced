/**
 * Academy L3 — pure bulk-score refuse-reason catalog honesty (no invent scores).
 *
 * Reasons mirror bulk-score.ts BulkScoreRefuse.
 */

export const BULK_SCORE_REFUSE_REASONS = [
  'season_not_live',
  'empty',
  'invalid_row',
  'duplicate_user',
] as const;
export type BulkScoreRefuseReasonId = (typeof BULK_SCORE_REFUSE_REASONS)[number];

export type BulkScoreResultBoardInput =
  | { readonly status: 'ok'; readonly accepted: number }
  | { readonly status: 'refuse'; readonly reason: BulkScoreRefuseReasonId };

/** L3 — reason catalog board. */
export function bulkScoreRefuseCatalogBoardCard(): {
  readonly reasons: number;
  readonly hasEmpty: number;
  readonly hasSeasonNotLive: number;
} {
  return {
    reasons: BULK_SCORE_REFUSE_REASONS.length,
    hasEmpty: BULK_SCORE_REFUSE_REASONS.includes('empty') ? 1 : 0,
    hasSeasonNotLive: BULK_SCORE_REFUSE_REASONS.includes('season_not_live') ? 1 : 0,
  };
}

/** L3 — catalog status line. */
export function bulkScoreRefuseCatalogStatusLine(): string {
  const c = bulkScoreRefuseCatalogBoardCard();
  return `reasons=${c.reasons} empty=${c.hasEmpty} season_not_live=${c.hasSeasonNotLive}`;
}

/** L3 — parse catalog. */
export function parseBulkScoreRefuseCatalogStatusLine(line: string): {
  readonly reasons: number;
  readonly empty: number;
  readonly seasonNotLive: number;
} | null {
  const m = line.trim().match(/^reasons=(\d+) empty=([01]) season_not_live=([01])$/);
  if (!m) return null;
  return {
    reasons: Number(m[1]),
    empty: Number(m[2]),
    seasonNotLive: Number(m[3]),
  };
}

/** L3 — true when catalog matches. */
export function bulkScoreRefuseCatalogStatusLineMatches(): boolean {
  const p = parseBulkScoreRefuseCatalogStatusLine(bulkScoreRefuseCatalogStatusLine());
  if (!p) return false;
  const c = bulkScoreRefuseCatalogBoardCard();
  return (
    p.reasons === c.reasons &&
    p.empty === c.hasEmpty &&
    p.seasonNotLive === c.hasSeasonNotLive
  );
}

/** L3 — result board. */
export function bulkScoreResultBoardCard(result: BulkScoreResultBoardInput): {
  readonly status: string;
  readonly accepted: number;
  readonly reason: string;
} {
  if (result.status === 'ok') {
    return { status: 'ok', accepted: result.accepted, reason: '-' };
  }
  return { status: 'refuse', accepted: 0, reason: result.reason };
}

/** L3 — result status line. */
export function bulkScoreResultStatusLine(result: BulkScoreResultBoardInput): string {
  const c = bulkScoreResultBoardCard(result);
  return `status=${c.status} accepted=${c.accepted} reason=${c.reason}`;
}

/** L3 — parse result. */
export function parseBulkScoreResultStatusLine(line: string): {
  readonly status: string;
  readonly accepted: number;
  readonly reason: string;
} | null {
  const m = line
    .trim()
    .match(/^status=(ok|refuse) accepted=(\d+) reason=([a-z0-9_-]+)$/);
  if (!m) return null;
  return {
    status: m[1]!,
    accepted: Number(m[2]),
    reason: m[3]!,
  };
}

/** L3 — true when result status matches. */
export function bulkScoreResultStatusLineMatches(result: BulkScoreResultBoardInput): boolean {
  const p = parseBulkScoreResultStatusLine(bulkScoreResultStatusLine(result));
  if (!p) return false;
  const c = bulkScoreResultBoardCard(result);
  return p.status === c.status && p.accepted === c.accepted && p.reason === c.reason;
}

/** L3 — refuse has accepted 0. */
export function bulkScoreResultStatusLineConsistent(line: string): boolean {
  const p = parseBulkScoreResultStatusLine(line);
  if (!p) return false;
  if (p.status === 'refuse') return p.accepted === 0;
  return p.reason === '-';
}

/** L3 — export header. */
export function bulkScoreResultExportHeader(): string {
  return 'status,accepted,reason';
}

/** L3 — export line. */
export function bulkScoreResultExportLine(result: BulkScoreResultBoardInput): string {
  const c = bulkScoreResultBoardCard(result);
  return `${c.status},${c.accepted},${c.reason}`;
}

/** L3 — full export. */
export function bulkScoreResultExportText(result: BulkScoreResultBoardInput): string {
  return [bulkScoreResultExportHeader(), bulkScoreResultExportLine(result)].join('\n');
}

/** L3 — reason declared. */
export function isDeclaredBulkScoreRefuseReason(reason: string): boolean {
  return (BULK_SCORE_REFUSE_REASONS as readonly string[]).includes(reason);
}
