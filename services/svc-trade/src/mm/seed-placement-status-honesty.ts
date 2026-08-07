/**
 * Trade L3 — pure seed-placement status catalog honesty (structural only).
 *
 * Mirrors seed-market.ts SeedPlacementStatus.
 * Does not invent seed money or hold amounts.
 */

export const SEED_PLACEMENT_STATUSES = ['resting', 'rejected', 'hold_failed', 'submit_indeterminate', 'released_after_reject'] as const;
export type SeedPlacementStatusId = (typeof SEED_PLACEMENT_STATUSES)[number];

/** L3 — catalog board. */
export function seedPlacementStatusCatalogBoardCard(): {
  readonly statuses: number;
  readonly hasResting: number;
  readonly hasRejected: number;
  readonly hasHoldFailed: number;
  readonly hasReleasedAfterReject: number;
} {
  return {
    statuses: SEED_PLACEMENT_STATUSES.length,
    hasResting: SEED_PLACEMENT_STATUSES.includes('resting') ? 1 : 0,
    hasRejected: SEED_PLACEMENT_STATUSES.includes('rejected') ? 1 : 0,
    hasHoldFailed: SEED_PLACEMENT_STATUSES.includes('hold_failed') ? 1 : 0,
    hasReleasedAfterReject: SEED_PLACEMENT_STATUSES.includes('released_after_reject') ? 1 : 0,
  };
}

/** L3 — status line. */
export function seedPlacementStatusCatalogStatusLine(): string {
  const c = seedPlacementStatusCatalogBoardCard();
  return `statuses=${c.statuses} resting=${c.hasResting} rejected=${c.hasRejected} hold_failed=${c.hasHoldFailed} released_after_reject=${c.hasReleasedAfterReject}`;
}

/** L3 — parse status. */
export function parseSeedPlacementStatusCatalogStatusLine(line: string): {
  readonly statuses: number;
  readonly resting: number;
  readonly rejected: number;
  readonly holdFailed: number;
  readonly releasedAfterReject: number;
} | null {
  const m = line.trim().match(/^statuses=(\d+) resting=([01]) rejected=([01]) hold_failed=([01]) released_after_reject=([01])$/);
  if (!m) return null;
  return {
    statuses: Number(m[1]),
    resting: Number(m[2]),
    rejected: Number(m[3]),
    holdFailed: Number(m[4]),
    releasedAfterReject: Number(m[5]),
  };
}

/** L3 — true when status matches. */
export function seedPlacementStatusCatalogStatusLineMatches(): boolean {
  const p = parseSeedPlacementStatusCatalogStatusLine(seedPlacementStatusCatalogStatusLine());
  if (!p) return false;
  const c = seedPlacementStatusCatalogBoardCard();
  return (
    p.statuses === c.statuses &&
    p.resting === c.hasResting &&
    p.rejected === c.hasRejected &&
    p.holdFailed === c.hasHoldFailed &&
    p.releasedAfterReject === c.hasReleasedAfterReject
  );
}

/** L3 — five statuses; released_after_reject present (lets funds out). */
export function seedPlacementStatusCatalogStatusLineConsistent(line: string): boolean {
  const p = parseSeedPlacementStatusCatalogStatusLine(line);
  if (!p) return false;
  return p.statuses === 5 && p.resting === 1 && p.rejected === 1 && p.holdFailed === 1 && p.releasedAfterReject === 1;
}

/** L3 — export header. */
export function seedPlacementStatusCatalogExportHeader(): string {
  return 'seed_placement_status';
}

/** L3 — export lines. */
export function seedPlacementStatusCatalogExportLines(): readonly string[] {
  return [...SEED_PLACEMENT_STATUSES];
}

/** L3 — full export. */
export function seedPlacementStatusCatalogExportText(): string {
  return [seedPlacementStatusCatalogExportHeader(), ...seedPlacementStatusCatalogExportLines()].join('\n');
}

/** L3 — status declared. */
export function isDeclaredSeedPlacementStatus(s: string): boolean {
  return (SEED_PLACEMENT_STATUSES as readonly string[]).includes(s);
}
