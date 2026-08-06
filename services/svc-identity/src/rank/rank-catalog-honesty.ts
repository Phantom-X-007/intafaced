/**
 * Identity L3 — pure rank ladder catalog honesty boards (no DB I/O).
 *
 * Mirrors thresholds.ts RANK_TIERS shape. Does not invent fee/perk numbers —
 * only reports structural counts already present on tip L1 seed.
 */

export type RankTierBoardInput = {
  readonly rank: number;
  /** XP required as string so we never use number for money-adjacent values. */
  readonly xpRequired: string;
  readonly title: string;
  readonly lobbyHostRights: boolean;
  readonly otcAccess: boolean;
  readonly cardTier: string;
};

/** L3 — tier count. */
export function rankTierCount(tiers: readonly RankTierBoardInput[]): number {
  return tiers.length;
}

/** L3 — host-rights tier count. */
export function hostRightsTierCount(tiers: readonly RankTierBoardInput[]): number {
  return tiers.filter((t) => t.lobbyHostRights).length;
}

/** L3 — otc-access tier count. */
export function otcAccessTierCount(tiers: readonly RankTierBoardInput[]): number {
  return tiers.filter((t) => t.otcAccess).length;
}

/** L3 — card tier histogram. */
export function cardTierHistogram(
  tiers: readonly RankTierBoardInput[],
): Readonly<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of tiers) {
    out[t.cardTier] = (out[t.cardTier] ?? 0) + 1;
  }
  return out;
}

/** L3 — board card. */
export function rankCatalogBoardCard(tiers: readonly RankTierBoardInput[]): {
  readonly tiers: number;
  readonly hostRights: number;
  readonly otc: number;
  readonly maxRank: number;
} {
  let maxRank = -1;
  for (const t of tiers) if (t.rank > maxRank) maxRank = t.rank;
  return {
    tiers: tiers.length,
    hostRights: hostRightsTierCount(tiers),
    otc: otcAccessTierCount(tiers),
    maxRank: tiers.length === 0 ? -1 : maxRank,
  };
}

/** L3 — status line. */
export function rankCatalogStatusLine(tiers: readonly RankTierBoardInput[]): string {
  const c = rankCatalogBoardCard(tiers);
  return `tiers=${c.tiers} host_rights=${c.hostRights} otc=${c.otc} max_rank=${c.maxRank}`;
}

/** L3 — parse status. Invalid → null. */
export function parseRankCatalogStatusLine(line: string): {
  readonly tiers: number;
  readonly hostRights: number;
  readonly otc: number;
  readonly maxRank: number;
} | null {
  const m = line.trim().match(/^tiers=(\d+) host_rights=(\d+) otc=(\d+) max_rank=(-?\d+)$/);
  if (!m) return null;
  return {
    tiers: Number(m[1]),
    hostRights: Number(m[2]),
    otc: Number(m[3]),
    maxRank: Number(m[4]),
  };
}

/** L3 — true when status matches. */
export function rankCatalogStatusLineMatches(tiers: readonly RankTierBoardInput[]): boolean {
  const p = parseRankCatalogStatusLine(rankCatalogStatusLine(tiers));
  if (!p) return false;
  const c = rankCatalogBoardCard(tiers);
  return (
    p.tiers === c.tiers &&
    p.hostRights === c.hostRights &&
    p.otc === c.otc &&
    p.maxRank === c.maxRank
  );
}

/** L3 — true when host/otc cannot exceed tiers. */
export function rankCatalogStatusLineConsistent(line: string): boolean {
  const p = parseRankCatalogStatusLine(line);
  if (!p) return false;
  return p.hostRights <= p.tiers && p.otc <= p.tiers;
}

/** L3 — export header. */
export function rankCatalogExportHeader(): string {
  return 'tiers,host_rights,otc,max_rank';
}

/** L3 — export line. */
export function rankCatalogExportLine(tiers: readonly RankTierBoardInput[]): string {
  const c = rankCatalogBoardCard(tiers);
  return `${c.tiers},${c.hostRights},${c.otc},${c.maxRank}`;
}

/** L3 — full export. */
export function rankCatalogExportText(tiers: readonly RankTierBoardInput[]): string {
  return [rankCatalogExportHeader(), rankCatalogExportLine(tiers)].join('\n');
}

/** L3 — titles list (sorted by rank). */
export function rankTitles(tiers: readonly RankTierBoardInput[]): readonly string[] {
  return [...tiers].sort((a, b) => a.rank - b.rank).map((t) => t.title);
}

/** L3 — has title. */
export function rankHasTitle(tiers: readonly RankTierBoardInput[], title: string): boolean {
  return tiers.some((t) => t.title === title);
}

/** L3 — tier count in range. */
export function rankTierCountInRange(
  tiers: readonly RankTierBoardInput[],
  min: number,
  max: number,
): boolean {
  if (min > max) return false;
  const n = tiers.length;
  return n >= min && n <= max;
}
