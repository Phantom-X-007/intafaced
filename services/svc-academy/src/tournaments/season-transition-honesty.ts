/**
 * Academy L3 — pure season transition graph honesty boards (no prize invent).
 *
 * Mirrors season-lifecycle.ts ALLOWED edges. Class M payouts out of scope.
 */

export const SEASON_STATUSES = ['scheduled', 'live', 'frozen', 'ended'] as const;
export type SeasonStatusId = (typeof SEASON_STATUSES)[number];

/** L3 — allowed next map (mirror lifecycle). */
export const SEASON_ALLOWED_NEXT: Readonly<Record<SeasonStatusId, readonly SeasonStatusId[]>> = {
  scheduled: ['live', 'ended'],
  live: ['frozen', 'ended'],
  frozen: ['ended', 'live'],
  ended: [],
};

/** L3 — edge count for a status. */
export function allowedNextCount(status: SeasonStatusId): number {
  return SEASON_ALLOWED_NEXT[status].length;
}

/** L3 — true when edge is allowed. */
export function isAllowedSeasonTransition(from: SeasonStatusId, to: SeasonStatusId): boolean {
  return SEASON_ALLOWED_NEXT[from].includes(to);
}

/** L3 — total graph edges. */
export function seasonTransitionEdgeCount(): number {
  let n = 0;
  for (const s of SEASON_STATUSES) n += SEASON_ALLOWED_NEXT[s].length;
  return n;
}

/** L3 — catalog board. */
export function seasonTransitionCatalogBoardCard(): {
  readonly statuses: number;
  readonly edges: number;
  readonly terminalEdges: number;
  readonly scheduledEdges: number;
} {
  return {
    statuses: SEASON_STATUSES.length,
    edges: seasonTransitionEdgeCount(),
    terminalEdges: allowedNextCount('ended'),
    scheduledEdges: allowedNextCount('scheduled'),
  };
}

/** L3 — status line. */
export function seasonTransitionCatalogStatusLine(): string {
  const c = seasonTransitionCatalogBoardCard();
  return `statuses=${c.statuses} edges=${c.edges} terminal_edges=${c.terminalEdges} scheduled_edges=${c.scheduledEdges}`;
}

/** L3 — parse status. */
export function parseSeasonTransitionCatalogStatusLine(line: string): {
  readonly statuses: number;
  readonly edges: number;
  readonly terminalEdges: number;
  readonly scheduledEdges: number;
} | null {
  const m = line.trim().match(/^statuses=(\d+) edges=(\d+) terminal_edges=(\d+) scheduled_edges=(\d+)$/);
  if (!m) return null;
  return {
    statuses: Number(m[1]),
    edges: Number(m[2]),
    terminalEdges: Number(m[3]),
    scheduledEdges: Number(m[4]),
  };
}

/** L3 — true when status matches. */
export function seasonTransitionCatalogStatusLineMatches(): boolean {
  const p = parseSeasonTransitionCatalogStatusLine(seasonTransitionCatalogStatusLine());
  if (!p) return false;
  const c = seasonTransitionCatalogBoardCard();
  return p.statuses === c.statuses && p.edges === c.edges && p.terminalEdges === c.terminalEdges && p.scheduledEdges === c.scheduledEdges;
}

/** L3 — ended has zero edges. */
export function seasonTransitionCatalogStatusLineConsistent(line: string): boolean {
  const p = parseSeasonTransitionCatalogStatusLine(line);
  if (!p) return false;
  return p.terminalEdges === 0 && p.statuses === 4;
}

/** L3 — export header. */
export function seasonTransitionCatalogExportHeader(): string {
  return 'statuses,edges,terminal_edges,scheduled_edges';
}

/** L3 — export line. */
export function seasonTransitionCatalogExportLine(): string {
  const c = seasonTransitionCatalogBoardCard();
  return `${c.statuses},${c.edges},${c.terminalEdges},${c.scheduledEdges}`;
}

/** L3 — full export. */
export function seasonTransitionCatalogExportText(): string {
  return [seasonTransitionCatalogExportHeader(), seasonTransitionCatalogExportLine()].join('\n');
}

/** L3 — score writable only live (mirror isScoreWritable). */
export function seasonScoreWritable(status: SeasonStatusId): boolean {
  return status === 'live';
}

/** L3 — freeze only from live. */
export function seasonMayFreeze(status: SeasonStatusId): boolean {
  return status === 'live';
}
