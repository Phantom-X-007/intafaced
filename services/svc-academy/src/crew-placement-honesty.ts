/**
 * Academy L3 — pure crew placement honesty boards (no bus I/O).
 *
 * Shapes mirror crew-events.ts MemoryCrewLobbyRouter / CrewPlacement.
 * Does not mount the NOT WIRED subscription — boards only.
 */

export type CrewPlacementInput = {
  readonly crewId: string;
  readonly userId: string;
  readonly role: string;
  readonly crewSize: number;
  readonly matchRunId: string;
};

/** L3 — placement count. */
export function placementCount(placements: readonly CrewPlacementInput[]): number {
  return placements.length;
}

/** L3 — unique crew ids. */
export function uniquePlacementCrewIds(placements: readonly CrewPlacementInput[]): readonly string[] {
  return [...new Set(placements.map((p) => p.crewId))].sort();
}

/** L3 — unique match runs. */
export function uniqueMatchRunIds(placements: readonly CrewPlacementInput[]): readonly string[] {
  return [...new Set(placements.map((p) => p.matchRunId))].sort();
}

/** L3 — board card. */
export function placementBoardCard(placements: readonly CrewPlacementInput[]): {
  readonly placements: number;
  readonly crews: number;
  readonly users: number;
  readonly matchRuns: number;
  readonly totalCrewSize: number;
} {
  const users = new Set(placements.map((p) => p.userId));
  let totalCrewSize = 0;
  for (const p of placements) totalCrewSize += p.crewSize;
  return {
    placements: placements.length,
    crews: uniquePlacementCrewIds(placements).length,
    users: users.size,
    matchRuns: uniqueMatchRunIds(placements).length,
    totalCrewSize,
  };
}

/** L3 — status line. */
export function placementStatusLine(placements: readonly CrewPlacementInput[]): string {
  const c = placementBoardCard(placements);
  return `placements=${c.placements} crews=${c.crews} users=${c.users} match_runs=${c.matchRuns} crew_size_sum=${c.totalCrewSize}`;
}

/** L3 — parse status. Invalid → null. */
export function parsePlacementStatusLine(line: string): {
  readonly placements: number;
  readonly crews: number;
  readonly users: number;
  readonly matchRuns: number;
  readonly crewSizeSum: number;
} | null {
  const m = line
    .trim()
    .match(/^placements=(\d+) crews=(\d+) users=(\d+) match_runs=(\d+) crew_size_sum=(\d+)$/);
  if (!m) return null;
  return {
    placements: Number(m[1]),
    crews: Number(m[2]),
    users: Number(m[3]),
    matchRuns: Number(m[4]),
    crewSizeSum: Number(m[5]),
  };
}

/** L3 — true when status matches. */
export function placementStatusLineMatches(placements: readonly CrewPlacementInput[]): boolean {
  const p = parsePlacementStatusLine(placementStatusLine(placements));
  if (!p) return false;
  const c = placementBoardCard(placements);
  return (
    p.placements === c.placements &&
    p.crews === c.crews &&
    p.users === c.users &&
    p.matchRuns === c.matchRuns &&
    p.crewSizeSum === c.totalCrewSize
  );
}

/** L3 — true when crews/users/matchRuns cannot exceed placements. */
export function placementStatusLineConsistent(line: string): boolean {
  const p = parsePlacementStatusLine(line);
  if (!p) return false;
  return p.crews <= p.placements && p.users <= p.placements && p.matchRuns <= p.placements;
}

/** L3 — export header. */
export function placementExportHeader(): string {
  return 'placements,crews,users,match_runs,crew_size_sum';
}

/** L3 — export line. */
export function placementExportLine(placements: readonly CrewPlacementInput[]): string {
  const c = placementBoardCard(placements);
  return `${c.placements},${c.crews},${c.users},${c.matchRuns},${c.totalCrewSize}`;
}

/** L3 — full export. */
export function placementExportText(placements: readonly CrewPlacementInput[]): string {
  return [placementExportHeader(), placementExportLine(placements)].join('\n');
}

/** L3 — true when no placements. */
export function placementListEmpty(placements: readonly CrewPlacementInput[]): boolean {
  return placements.length === 0;
}

/** L3 — count in range. */
export function placementCountInRange(
  placements: readonly CrewPlacementInput[],
  min: number,
  max: number,
): boolean {
  if (min > max) return false;
  const n = placements.length;
  return n >= min && n <= max;
}
