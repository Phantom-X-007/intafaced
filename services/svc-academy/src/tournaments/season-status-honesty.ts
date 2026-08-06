/**
 * Academy L3 — pure tournament season status honesty boards (no score invent).
 *
 * Mirrors ladder.ts SeasonStatus + standings page shapes.
 */

export const SEASON_STATUSES = ['scheduled', 'live', 'frozen', 'ended'] as const;
export type SeasonStatusId = (typeof SEASON_STATUSES)[number];

export type StandingBoardInput = {
  readonly userId: string;
  readonly score: number;
  readonly rank: number;
};

export type SeasonBoardInput = {
  readonly status: SeasonStatusId;
  readonly standings: readonly StandingBoardInput[];
};

/** L3 — catalog board. */
export function seasonStatusCatalogBoardCard(): {
  readonly statuses: number;
  readonly mayWriteScoreWhenScheduled: number;
  readonly mayWriteScoreWhenEnded: number;
} {
  return {
    statuses: SEASON_STATUSES.length,
    mayWriteScoreWhenScheduled: 0,
    mayWriteScoreWhenEnded: 0,
  };
}

/** L3 — catalog status line. */
export function seasonStatusCatalogStatusLine(): string {
  const c = seasonStatusCatalogBoardCard();
  return `statuses=${c.statuses} write_scheduled=${c.mayWriteScoreWhenScheduled} write_ended=${c.mayWriteScoreWhenEnded}`;
}

/** L3 — parse catalog. */
export function parseSeasonStatusCatalogStatusLine(line: string): {
  readonly statuses: number;
  readonly writeScheduled: number;
  readonly writeEnded: number;
} | null {
  const m = line
    .trim()
    .match(/^statuses=(\d+) write_scheduled=([01]) write_ended=([01])$/);
  if (!m) return null;
  return {
    statuses: Number(m[1]),
    writeScheduled: Number(m[2]),
    writeEnded: Number(m[3]),
  };
}

/** L3 — true when catalog matches. */
export function seasonStatusCatalogStatusLineMatches(): boolean {
  const p = parseSeasonStatusCatalogStatusLine(seasonStatusCatalogStatusLine());
  if (!p) return false;
  const c = seasonStatusCatalogBoardCard();
  return (
    p.statuses === c.statuses &&
    p.writeScheduled === c.mayWriteScoreWhenScheduled &&
    p.writeEnded === c.mayWriteScoreWhenEnded
  );
}

/** L3 — no write when scheduled/ended (mirror assertMayWriteScore intent). */
export function seasonStatusCatalogStatusLineConsistent(line: string): boolean {
  const p = parseSeasonStatusCatalogStatusLine(line);
  if (!p) return false;
  return p.writeScheduled === 0 && p.writeEnded === 0 && p.statuses === 4;
}

/** L3 — true when scores may be written. */
export function seasonMayWriteScores(status: SeasonStatusId): boolean {
  return status === 'live' || status === 'frozen';
}

/** L3 — standings board. */
export function standingsBoardCard(season: SeasonBoardInput): {
  readonly status: string;
  readonly standings: number;
  readonly mayWrite: number;
  readonly topRank: number;
} {
  let topRank = 0;
  for (const s of season.standings) if (s.rank > 0 && (topRank === 0 || s.rank < topRank)) topRank = s.rank;
  return {
    status: season.status,
    standings: season.standings.length,
    mayWrite: seasonMayWriteScores(season.status) ? 1 : 0,
    topRank: season.standings.length === 0 ? 0 : topRank,
  };
}

/** L3 — status line. */
export function standingsStatusLine(season: SeasonBoardInput): string {
  const c = standingsBoardCard(season);
  return `status=${c.status} standings=${c.standings} may_write=${c.mayWrite} top_rank=${c.topRank}`;
}

/** L3 — parse standings. */
export function parseStandingsStatusLine(line: string): {
  readonly status: string;
  readonly standings: number;
  readonly mayWrite: number;
  readonly topRank: number;
} | null {
  const m = line
    .trim()
    .match(
      /^status=(scheduled|live|frozen|ended) standings=(\d+) may_write=([01]) top_rank=(\d+)$/,
    );
  if (!m) return null;
  return {
    status: m[1]!,
    standings: Number(m[2]),
    mayWrite: Number(m[3]),
    topRank: Number(m[4]),
  };
}

/** L3 — true when status matches. */
export function standingsStatusLineMatches(season: SeasonBoardInput): boolean {
  const p = parseStandingsStatusLine(standingsStatusLine(season));
  if (!p) return false;
  const c = standingsBoardCard(season);
  return (
    p.status === c.status &&
    p.standings === c.standings &&
    p.mayWrite === c.mayWrite &&
    p.topRank === c.topRank
  );
}

/** L3 — may_write only for live/frozen. */
export function standingsStatusLineConsistent(line: string): boolean {
  const p = parseStandingsStatusLine(line);
  if (!p) return false;
  const expectWrite = p.status === 'live' || p.status === 'frozen' ? 1 : 0;
  return p.mayWrite === expectWrite && p.topRank <= p.standings;
}

/** L3 — export header. */
export function standingsExportHeader(): string {
  return 'status,standings,may_write,top_rank';
}

/** L3 — export line. */
export function standingsExportLine(season: SeasonBoardInput): string {
  const c = standingsBoardCard(season);
  return `${c.status},${c.standings},${c.mayWrite},${c.topRank}`;
}

/** L3 — full export. */
export function standingsExportText(season: SeasonBoardInput): string {
  return [standingsExportHeader(), standingsExportLine(season)].join('\n');
}

/** L3 — count in range. */
export function standingsCountInRange(season: SeasonBoardInput, min: number, max: number): boolean {
  if (min > max) return false;
  const n = season.standings.length;
  return n >= min && n <= max;
}
