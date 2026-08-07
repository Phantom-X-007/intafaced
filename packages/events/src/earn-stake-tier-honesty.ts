/**
 * Events L3 — pure earn stake-tier catalog honesty (structural only).
 *
 * Mirrors catalog.ts stake tier: flex | m3 | m12.
 * Does not invent yield rates, unlock policy, or product tiers.
 */

export const EARN_STAKE_TIERS = ['flex', 'm3', 'm12'] as const;
export type EarnStakeTierId = (typeof EARN_STAKE_TIERS)[number];

/** L3 — catalog board. */
export function earnStakeTierCatalogBoardCard(): {
  readonly tiers: number;
  readonly hasFlex: number;
  readonly hasM3: number;
  readonly hasM12: number;
} {
  return {
    tiers: EARN_STAKE_TIERS.length,
    hasFlex: EARN_STAKE_TIERS.includes('flex') ? 1 : 0,
    hasM3: EARN_STAKE_TIERS.includes('m3') ? 1 : 0,
    hasM12: EARN_STAKE_TIERS.includes('m12') ? 1 : 0,
  };
}

/** L3 — status line. */
export function earnStakeTierCatalogStatusLine(): string {
  const c = earnStakeTierCatalogBoardCard();
  return `tiers=${c.tiers} flex=${c.hasFlex} m3=${c.hasM3} m12=${c.hasM12}`;
}

/** L3 — parse status. */
export function parseEarnStakeTierCatalogStatusLine(line: string): {
  readonly tiers: number;
  readonly flex: number;
  readonly m3: number;
  readonly m12: number;
} | null {
  const m = line.trim().match(/^tiers=(\d+) flex=([01]) m3=([01]) m12=([01])$/);
  if (!m) return null;
  return { tiers: Number(m[1]), flex: Number(m[2]), m3: Number(m[3]), m12: Number(m[4]) };
}

/** L3 — true when status matches. */
export function earnStakeTierCatalogStatusLineMatches(): boolean {
  const p = parseEarnStakeTierCatalogStatusLine(earnStakeTierCatalogStatusLine());
  if (!p) return false;
  const c = earnStakeTierCatalogBoardCard();
  return p.tiers === c.tiers && p.flex === c.hasFlex && p.m3 === c.hasM3 && p.m12 === c.hasM12;
}

/** L3 — three tiers. */
export function earnStakeTierCatalogStatusLineConsistent(line: string): boolean {
  const p = parseEarnStakeTierCatalogStatusLine(line);
  if (!p) return false;
  return p.tiers === 3 && p.flex === 1 && p.m3 === 1 && p.m12 === 1;
}

/** L3 — export header. */
export function earnStakeTierCatalogExportHeader(): string {
  return 'earn_stake_tier';
}

/** L3 — export lines. */
export function earnStakeTierCatalogExportLines(): readonly string[] {
  return [...EARN_STAKE_TIERS];
}

/** L3 — full export. */
export function earnStakeTierCatalogExportText(): string {
  return [earnStakeTierCatalogExportHeader(), ...earnStakeTierCatalogExportLines()].join('\n');
}

/** L3 — tier declared. */
export function isDeclaredEarnStakeTier(tier: string): boolean {
  return (EARN_STAKE_TIERS as readonly string[]).includes(tier);
}
