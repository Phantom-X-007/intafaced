/**
 * Tournament Stage-2 — season lifecycle admin (non-money).
 *
 * Spec: prize pools = Class M (NOT here). This slice only advances season
 * status: scheduled → live → frozen → ended. Score writes still gated by
 * assertMayWriteScore (live only). Freeze may capture an immutable ranked
 * snapshot for operator audit — still zero money fields.
 *
 * Stage-3: freeze / end edges call assertNoPrizeAttachment — IFC prizes
 * refuse-closed (see prize-refuse.ts). Ending never invents a pool.
 */

import type { RankedStanding, SeasonRecord, SeasonStatus, StandingRecord } from './ladder.js';
import { rankStandings, TournamentError } from './ladder.js';
import { assertNoPrizeAttachment } from './prize-refuse.js';

/** Owner-published page size. Blank / non-finite / <1 refuses. Never invent all.length. */
export function assertSeasonListPageLimit(limit: number | null | undefined): number {
  if (limit === undefined || limit === null || typeof limit !== 'number' || !Number.isFinite(limit)) {
    throw new TournamentError('Season list limit is unset — pass limit (never invent all.length)', 'academy.season_list_limit_unset');
  }
  const n = Math.floor(limit);
  if (n < 1) {
    throw new TournamentError('Season list limit is unset — pass limit (never invent all.length)', 'academy.season_list_limit_unset');
  }
  return Math.min(200, n);
}

/**
 * Legal edges only. `frozen → live` is deliberately closed:
 * RULES-STAGE1 forbids silent re-rank after freeze without a new season, and
 * freeze snapshots are immutable (season_id PK + ON CONFLICT DO NOTHING).
 * Re-opening would let scores diverge from the durable audit snapshot.
 */
const ALLOWED: Readonly<Record<SeasonStatus, readonly SeasonStatus[]>> = {
  scheduled: ['live', 'ended'],
  live: ['frozen', 'ended'],
  frozen: ['ended'],
  ended: [],
};

/**
 * Transition season status. Invalid edges throw.
 * Ending a season does not invent prizes — payout is a separate Class M path.
 */
export function transitionSeason(season: SeasonRecord, next: SeasonStatus): SeasonRecord {
  assertNoPrizeAttachment(season);
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
 * Prize / IFC fields on the input or snapshot are refuse-closed.
 */
export function snapshotStandingsAtFreeze(input: {
  seasonId: string;
  status: SeasonStatus;
  rows: readonly StandingRecord[];
  frozenAt?: Date;
}): FreezeStandingsSnapshot {
  assertMayFreeze(input.status);
  assertNoPrizeAttachment(input);
  if (!input.seasonId?.trim()) {
    throw new TournamentError('seasonId required for freeze snapshot', 'academy.season_invalid');
  }
  const forSeason = input.rows.filter((r) => r.seasonId === input.seasonId);
  const snapshot: FreezeStandingsSnapshot = {
    seasonId: input.seasonId,
    frozenAt: input.frozenAt ?? new Date(),
    standings: rankStandings(forSeason),
  };
  assertNoPrizeAttachment(snapshot);
  return snapshot;
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

/** L3 — scheduled ids joined. Empty → "". */
export function scheduledSeasonIdsJoined(seasons: readonly SeasonRecord[]): string {
  return listScheduledSeasonIds(seasons).join(',');
}

/** L3 — frozen ids joined. Empty → "". */
export function frozenSeasonIdsJoined(seasons: readonly SeasonRecord[]): string {
  return listFrozenSeasonIds(seasons).join(',');
}

/** L3 — ended ids joined. Empty → "". */
export function endedSeasonIdsJoined(seasons: readonly SeasonRecord[]): string {
  return listEndedSeasonIds(seasons).join(',');
}

/** L3 — score-writable ids joined. Empty → "". */
export function scoreWritableSeasonIdsJoined(seasons: readonly SeasonRecord[]): string {
  return listScoreWritableSeasonIds(seasons).join(',');
}

/** L3 — live season ratio label or empty. */
export function liveSeasonRatioLabel(seasons: readonly SeasonRecord[]): string {
  return liveSeasonRatio(seasons) ?? '';
}

/** L3 — frozen season ratio label or empty. */
export function frozenSeasonRatioLabel(seasons: readonly SeasonRecord[]): string {
  return frozenSeasonRatio(seasons) ?? '';
}

/** L3 — ended season ratio label or empty. */
export function endedSeasonRatioLabel(seasons: readonly SeasonRecord[]): string {
  return endedSeasonRatio(seasons) ?? '';
}

/** L3 — open season ratio label or empty. */
export function openSeasonRatioLabel(seasons: readonly SeasonRecord[]): string {
  return openSeasonRatio(seasons) ?? '';
}

/** L3 — status count snapshot. Empty zeros. */
export function seasonStatusSnapshot(seasons: readonly SeasonRecord[]): {
  readonly scheduled: number;
  readonly live: number;
  readonly frozen: number;
  readonly ended: number;
  readonly total: number;
} {
  return {
    scheduled: scheduledSeasonCount(seasons),
    live: liveSeasonCount(seasons),
    frozen: frozenSeasonCount(seasons),
    ended: endedSeasonCount(seasons),
    total: totalSeasonCount(seasons),
  };
}

/** L3 — true when status counts sum to total. */
export function seasonCountsConsistent(seasons: readonly SeasonRecord[]): boolean {
  const s = seasonStatusSnapshot(seasons);
  return s.total === s.scheduled + s.live + s.frozen + s.ended;
}

/** L3 — open vs ended partition. */
export function seasonOpenEndedPartition(seasons: readonly SeasonRecord[]): {
  readonly open: number;
  readonly ended: number;
} {
  return { open: openSeasonCount(seasons), ended: endedSeasonCount(seasons) };
}

/** L3 — writable presence snapshot. */
export function seasonWritableSnapshot(seasons: readonly SeasonRecord[]): {
  readonly writableCount: number;
  readonly hasWritable: boolean;
  readonly writableIds: readonly string[];
} {
  return {
    writableCount: scoreWritableSeasonCount(seasons),
    hasWritable: hasScoreWritableSeason(seasons),
    writableIds: listScoreWritableSeasonIds(seasons),
  };
}

/** L3 — season board headline. */
export function seasonBoardHeadline(seasons: readonly SeasonRecord[]): {
  readonly total: number;
  readonly live: number;
  readonly scheduled: number;
  readonly frozen: number;
  readonly ended: number;
  readonly open: number;
  readonly empty: boolean;
  readonly hasWritable: boolean;
} {
  return {
    total: totalSeasonCount(seasons),
    live: liveSeasonCount(seasons),
    scheduled: scheduledSeasonCount(seasons),
    frozen: frozenSeasonCount(seasons),
    ended: endedSeasonCount(seasons),
    open: openSeasonCount(seasons),
    empty: isSeasonListEmpty(seasons),
    hasWritable: hasScoreWritableSeason(seasons),
  };
}

/** L3 — one season card. Missing → null status. */
export function seasonCard(
  seasons: readonly SeasonRecord[],
  seasonId: string,
): {
  readonly id: string;
  readonly present: boolean;
  readonly status: SeasonStatus | null;
  readonly terminal: boolean;
  readonly writable: boolean;
} {
  const id = seasonId.trim();
  const row = seasons.find((s) => s.id === id);
  if (!row) return { id, present: false, status: null, terminal: false, writable: false };
  return {
    id,
    present: true,
    status: row.status,
    terminal: isSeasonTerminal(row.status),
    writable: isScoreWritable(row.status),
  };
}

/** L3 — cards for all seasons (sorted ids). */
export function listSeasonCards(seasons: readonly SeasonRecord[]): readonly {
  readonly id: string;
  readonly status: SeasonStatus;
  readonly terminal: boolean;
  readonly writable: boolean;
}[] {
  return listSeasonIds(seasons).map((id) => {
    const row = seasons.find((s) => s.id === id)!;
    return {
      id,
      status: row.status,
      terminal: isSeasonTerminal(row.status),
      writable: isScoreWritable(row.status),
    };
  });
}

/** L3 — true when season card is present. */
export function seasonPresent(seasons: readonly SeasonRecord[], seasonId: string): boolean {
  return seasonCard(seasons, seasonId).present;
}

/** L3 — filter season cards by status. Empty → []. */
export function filterSeasonCardsByStatus(
  seasons: readonly SeasonRecord[],
  status: SeasonStatus,
): readonly { readonly id: string; readonly status: SeasonStatus; readonly terminal: boolean; readonly writable: boolean }[] {
  return listSeasonCards(seasons).filter((c) => c.status === status);
}

/** L3 — search season ids by substring. Empty needle → []. */
export function searchSeasonIds(seasons: readonly SeasonRecord[], needle: string): readonly string[] {
  const n = needle.trim();
  if (!n) return [];
  return listSeasonIds(seasons).filter((id) => id.includes(n));
}

/** L3 — writable season cards only. Empty → []. */
export function listWritableSeasonCards(seasons: readonly SeasonRecord[]): readonly {
  readonly id: string;
  readonly status: SeasonStatus;
  readonly terminal: boolean;
  readonly writable: boolean;
}[] {
  return listSeasonCards(seasons).filter((c) => c.writable);
}

/** L3 — terminal season cards only. Empty → []. */
export function listTerminalSeasonCards(seasons: readonly SeasonRecord[]): readonly {
  readonly id: string;
  readonly status: SeasonStatus;
  readonly terminal: boolean;
  readonly writable: boolean;
}[] {
  return listSeasonCards(seasons).filter((c) => c.terminal);
}

/** L3 — page season ids (sorted). Limit must be published. Empty → []. */
export function pageSeasonIds(seasons: readonly SeasonRecord[], options: { offset?: number; limit?: number } = {}): readonly string[] {
  const all = listSeasonIds(seasons);
  const offset = Math.max(0, Math.floor(options.offset ?? 0));
  const limit = assertSeasonListPageLimit(options.limit);
  return all.slice(offset, offset + limit);
}

/** L3 — page live season ids. Limit must be published. Empty → []. */
export function pageLiveSeasonIds(seasons: readonly SeasonRecord[], options: { offset?: number; limit?: number } = {}): readonly string[] {
  const all = listLiveSeasonIds(seasons);
  const offset = Math.max(0, Math.floor(options.offset ?? 0));
  const limit = assertSeasonListPageLimit(options.limit);
  return all.slice(offset, offset + limit);
}

/** L3 — season list page count. */
export function seasonListPageCount(seasons: readonly SeasonRecord[], pageSize: number): number {
  if (!Number.isFinite(pageSize) || pageSize < 1) return 0;
  const n = totalSeasonCount(seasons);
  if (n === 0) return 0;
  return Math.ceil(n / Math.floor(pageSize));
}

/** L3 — reverse sorted season ids. Empty → []. */
export function reverseSeasonIds(seasons: readonly SeasonRecord[]): readonly string[] {
  return [...listSeasonIds(seasons)].reverse();
}

/** L3 — season ids only in left list. */
export function seasonIdsOnlyLeft(left: readonly SeasonRecord[], right: readonly SeasonRecord[]): readonly string[] {
  const r = new Set(listSeasonIds(right));
  return listSeasonIds(left).filter((id) => !r.has(id));
}

/** L3 — season ids in both lists. */
export function seasonIdsInBoth(left: readonly SeasonRecord[], right: readonly SeasonRecord[]): readonly string[] {
  const r = new Set(listSeasonIds(right));
  return listSeasonIds(left).filter((id) => r.has(id));
}

/** L3 — live count delta (left - right). */
export function liveSeasonCountDelta(left: readonly SeasonRecord[], right: readonly SeasonRecord[]): number {
  return liveSeasonCount(left) - liveSeasonCount(right);
}

/** L3 — true when season totals equal. */
export function seasonsSameSize(left: readonly SeasonRecord[], right: readonly SeasonRecord[]): boolean {
  return totalSeasonCount(left) === totalSeasonCount(right);
}

/** L3 — safe page season ids with clamped bounds. */
export function safePageSeasonIds(seasons: readonly SeasonRecord[], offset: number, limit: number): readonly string[] {
  if (!Number.isFinite(offset) || !Number.isFinite(limit)) return [];
  const all = listSeasonIds(seasons);
  const o = Math.max(0, Math.min(all.length, Math.floor(offset)));
  const l = Math.max(0, Math.min(all.length - o, Math.floor(limit)));
  return all.slice(o, o + l);
}

/** L3 — clamp season list page index. */
export function clampSeasonPageIndex(seasons: readonly SeasonRecord[], pageIndex: number, pageSize: number): number {
  const pages = seasonListPageCount(seasons, pageSize);
  if (pages === 0) return 0;
  if (!Number.isFinite(pageIndex)) return 0;
  return Math.max(0, Math.min(pages - 1, Math.floor(pageIndex)));
}

/** L3 — season ids at clamped page. */
export function seasonIdsAtPage(seasons: readonly SeasonRecord[], pageIndex: number, pageSize: number): readonly string[] {
  if (!Number.isFinite(pageSize) || pageSize < 1) return [];
  const idx = clampSeasonPageIndex(seasons, pageIndex, pageSize);
  const size = Math.floor(pageSize);
  return safePageSeasonIds(seasons, idx * size, size);
}

/** L3 — true when season page is valid. */
export function isValidSeasonPage(seasons: readonly SeasonRecord[], pageIndex: number, pageSize: number): boolean {
  const pages = seasonListPageCount(seasons, pageSize);
  if (pages === 0) return false;
  if (!Number.isFinite(pageIndex)) return false;
  const i = Math.floor(pageIndex);
  return i >= 0 && i < pages;
}

/** L3 — export lines: id,status. Empty → []. */
export function seasonsExportLines(seasons: readonly SeasonRecord[]): readonly string[] {
  return listSeasonCards(seasons).map((c) => `${c.id},${c.status}`);
}

/** L3 — seasons export header. */
export function seasonsExportHeader(): string {
  return 'id,status';
}

/** L3 — full seasons export text. */
export function seasonsExportText(seasons: readonly SeasonRecord[]): string {
  return [seasonsExportHeader(), ...seasonsExportLines(seasons)].join('\n');
}

/** L3 — export line count including header. */
export function seasonsExportLineCount(seasons: readonly SeasonRecord[]): number {
  return 1 + totalSeasonCount(seasons);
}

/**
 * L3 — parse "id,status". Invalid → null.
 */
export function parseSeasonsExportLine(line: string): { readonly id: string; readonly status: SeasonStatus } | null {
  const t = line.trim();
  if (!t || t === seasonsExportHeader()) return null;
  const parts = t.split(',');
  if (parts.length !== 2) return null;
  const id = parts[0]!.trim();
  const status = parts[1]!.trim();
  if (!id) return null;
  if (status !== 'scheduled' && status !== 'live' && status !== 'frozen' && status !== 'ended') return null;
  return { id, status };
}

/** L3 — count valid seasons export data lines. */
export function countSeasonsExportDataLines(text: string): number {
  return text
    .split('\n')
    .map((l) => parseSeasonsExportLine(l))
    .filter((r) => r !== null).length;
}

/** L3 — true when seasons export has header. */
export function seasonsExportHasHeader(text: string): boolean {
  const first = text.split('\n')[0]?.trim() ?? '';
  return first === seasonsExportHeader();
}

/** L3 — round-trip seasons export line count. */
export function seasonsExportRoundTripOk(seasons: readonly SeasonRecord[]): boolean {
  return seasonsExportLineCount(seasons) === 1 + countSeasonsExportDataLines(seasonsExportText(seasons));
}

/** L3 — one-line season board status. */
export function seasonStatusLine(seasons: readonly SeasonRecord[]): string {
  const h = seasonBoardHeadline(seasons);
  return `total=${h.total} live=${h.live} open=${h.open} ended=${h.ended}`;
}

/** L3 — true when season status is empty. */
export function seasonStatusLineIsEmpty(seasons: readonly SeasonRecord[]): boolean {
  return seasonStatusLine(seasons).startsWith('total=0');
}

/** L3 — detailed season status. */
export function seasonStatusLineDetailed(seasons: readonly SeasonRecord[]): string {
  const h = seasonBoardHeadline(seasons);
  return `total=${h.total} scheduled=${h.scheduled} live=${h.live} frozen=${h.frozen} ended=${h.ended} writable=${h.hasWritable ? '1' : '0'}`;
}

/** L3 — token count on detailed season status. */
export function seasonStatusLineTokenCount(seasons: readonly SeasonRecord[]): number {
  return seasonStatusLineDetailed(seasons).split(/\s+/).filter(Boolean).length;
}

/** L3 — parse "total=N live=L open=O ended=E". Invalid → null. */
export function parseSeasonStatusLine(
  line: string,
): { readonly total: number; readonly live: number; readonly open: number; readonly ended: number } | null {
  const m = line.trim().match(/^total=(\d+) live=(\d+) open=(\d+) ended=(\d+)$/);
  if (!m) return null;
  return { total: Number(m[1]), live: Number(m[2]), open: Number(m[3]), ended: Number(m[4]) };
}

/** L3 — true when status line matches seasons. */
export function seasonStatusLineMatches(seasons: readonly SeasonRecord[]): boolean {
  const p = parseSeasonStatusLine(seasonStatusLine(seasons));
  if (!p) return false;
  const h = seasonBoardHeadline(seasons);
  return p.total === h.total && p.live === h.live && p.open === h.open && p.ended === h.ended;
}

/** L3 — parse detailed season status. Invalid → null. */
export function parseSeasonStatusLineDetailed(line: string): {
  readonly total: number;
  readonly scheduled: number;
  readonly live: number;
  readonly frozen: number;
  readonly ended: number;
  readonly writable: boolean;
} | null {
  const m = line.trim().match(/^total=(\d+) scheduled=(\d+) live=(\d+) frozen=(\d+) ended=(\d+) writable=([01])$/);
  if (!m) return null;
  return {
    total: Number(m[1]),
    scheduled: Number(m[2]),
    live: Number(m[3]),
    frozen: Number(m[4]),
    ended: Number(m[5]),
    writable: m[6] === '1',
  };
}

/** L3 — true when detailed parts sum to total. */
export function seasonStatusLineDetailedConsistent(line: string): boolean {
  const p = parseSeasonStatusLineDetailed(line);
  if (!p) return false;
  return p.total === p.scheduled + p.live + p.frozen + p.ended;
}

/** L3 — true when season total is within [min,max]. Invalid → false. */
export function seasonCountInRange(seasons: readonly SeasonRecord[], min: number, max: number): boolean {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) return false;
  const n = totalSeasonCount(seasons);
  return n >= min && n <= max;
}

/** L3 — true when live count is at least n. */
export function liveSeasonCountAtLeast(seasons: readonly SeasonRecord[], n: number): boolean {
  if (!Number.isFinite(n)) return false;
  return liveSeasonCount(seasons) >= n;
}

/** L3 — clamp season page size into [1, total] (empty → 1). */
export function clampSeasonPageSize(seasons: readonly SeasonRecord[], pageSize: number): number {
  if (!Number.isFinite(pageSize)) return 1;
  const total = Math.max(1, totalSeasonCount(seasons));
  return Math.max(1, Math.min(total, Math.floor(pageSize)));
}

/** L3 — true when open season ratio is at least threshold. Empty → false. */
export function openSeasonRatioAtLeast(seasons: readonly SeasonRecord[], threshold: number): boolean {
  if (!Number.isFinite(threshold)) return false;
  const r = openSeasonRatio(seasons);
  if (r === null) return false;
  return Number(r) >= threshold;
}
