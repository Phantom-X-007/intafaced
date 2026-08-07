/**
 * Events L3 — pure p2p dispute-resolution catalog honesty (structural only).
 *
 * Mirrors catalog.ts resolution: release | refund.
 * Does not invent dispute policy or escrow recipes.
 */

export const P2P_RESOLUTIONS = ['release', 'refund'] as const;
export type P2pResolutionId = (typeof P2P_RESOLUTIONS)[number];

/** L3 — catalog board. */
export function p2pResolutionCatalogBoardCard(): {
  readonly resolutions: number;
  readonly hasRelease: number;
  readonly hasRefund: number;
} {
  return {
    resolutions: P2P_RESOLUTIONS.length,
    hasRelease: P2P_RESOLUTIONS.includes('release') ? 1 : 0,
    hasRefund: P2P_RESOLUTIONS.includes('refund') ? 1 : 0,
  };
}

/** L3 — status line. */
export function p2pResolutionCatalogStatusLine(): string {
  const c = p2pResolutionCatalogBoardCard();
  return `resolutions=${c.resolutions} release=${c.hasRelease} refund=${c.hasRefund}`;
}

/** L3 — parse status. */
export function parseP2pResolutionCatalogStatusLine(line: string): {
  readonly resolutions: number;
  readonly release: number;
  readonly refund: number;
} | null {
  const m = line.trim().match(/^resolutions=(\d+) release=([01]) refund=([01])$/);
  if (!m) return null;
  return { resolutions: Number(m[1]), release: Number(m[2]), refund: Number(m[3]) };
}

/** L3 — true when status matches. */
export function p2pResolutionCatalogStatusLineMatches(): boolean {
  const p = parseP2pResolutionCatalogStatusLine(p2pResolutionCatalogStatusLine());
  if (!p) return false;
  const c = p2pResolutionCatalogBoardCard();
  return p.resolutions === c.resolutions && p.release === c.hasRelease && p.refund === c.hasRefund;
}

/** L3 — two outcomes. */
export function p2pResolutionCatalogStatusLineConsistent(line: string): boolean {
  const p = parseP2pResolutionCatalogStatusLine(line);
  if (!p) return false;
  return p.resolutions === 2 && p.release === 1 && p.refund === 1;
}

/** L3 — export header. */
export function p2pResolutionCatalogExportHeader(): string {
  return 'p2p_resolution';
}

/** L3 — export lines. */
export function p2pResolutionCatalogExportLines(): readonly string[] {
  return [...P2P_RESOLUTIONS];
}

/** L3 — full export. */
export function p2pResolutionCatalogExportText(): string {
  return [p2pResolutionCatalogExportHeader(), ...p2pResolutionCatalogExportLines()].join('\n');
}

/** L3 — resolution declared. */
export function isDeclaredP2pResolution(resolution: string): boolean {
  return (P2P_RESOLUTIONS as readonly string[]).includes(resolution);
}
