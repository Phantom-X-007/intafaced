/**
 * Events L3 — pure p2p timeout-outcome catalog honesty (structural only).
 *
 * Mirrors catalog.ts trade expired outcome: released | refunded | voided | disputed.
 * Does not invent timeout clocks or escrow law.
 */

export const P2P_TIMEOUT_OUTCOMES = ['released', 'refunded', 'voided', 'disputed'] as const;
export type P2pTimeoutOutcomeId = (typeof P2P_TIMEOUT_OUTCOMES)[number];

/** L3 — catalog board. */
export function p2pTimeoutOutcomeCatalogBoardCard(): {
  readonly outcomes: number;
  readonly hasReleased: number;
  readonly hasRefunded: number;
  readonly hasVoided: number;
  readonly hasDisputed: number;
} {
  return {
    outcomes: P2P_TIMEOUT_OUTCOMES.length,
    hasReleased: P2P_TIMEOUT_OUTCOMES.includes('released') ? 1 : 0,
    hasRefunded: P2P_TIMEOUT_OUTCOMES.includes('refunded') ? 1 : 0,
    hasVoided: P2P_TIMEOUT_OUTCOMES.includes('voided') ? 1 : 0,
    hasDisputed: P2P_TIMEOUT_OUTCOMES.includes('disputed') ? 1 : 0,
  };
}

/** L3 — status line. */
export function p2pTimeoutOutcomeCatalogStatusLine(): string {
  const c = p2pTimeoutOutcomeCatalogBoardCard();
  return `outcomes=${c.outcomes} released=${c.hasReleased} refunded=${c.hasRefunded} voided=${c.hasVoided} disputed=${c.hasDisputed}`;
}

/** L3 — parse status. */
export function parseP2pTimeoutOutcomeCatalogStatusLine(line: string): {
  readonly outcomes: number;
  readonly released: number;
  readonly refunded: number;
  readonly voided: number;
  readonly disputed: number;
} | null {
  const m = line.trim().match(/^outcomes=(\d+) released=([01]) refunded=([01]) voided=([01]) disputed=([01])$/);
  if (!m) return null;
  return {
    outcomes: Number(m[1]),
    released: Number(m[2]),
    refunded: Number(m[3]),
    voided: Number(m[4]),
    disputed: Number(m[5]),
  };
}

/** L3 — true when status matches. */
export function p2pTimeoutOutcomeCatalogStatusLineMatches(): boolean {
  const p = parseP2pTimeoutOutcomeCatalogStatusLine(p2pTimeoutOutcomeCatalogStatusLine());
  if (!p) return false;
  const c = p2pTimeoutOutcomeCatalogBoardCard();
  return (
    p.outcomes === c.outcomes &&
    p.released === c.hasReleased &&
    p.refunded === c.hasRefunded &&
    p.voided === c.hasVoided &&
    p.disputed === c.hasDisputed
  );
}

/** L3 — four outcomes. */
export function p2pTimeoutOutcomeCatalogStatusLineConsistent(line: string): boolean {
  const p = parseP2pTimeoutOutcomeCatalogStatusLine(line);
  if (!p) return false;
  return p.outcomes === 4 && p.released === 1 && p.refunded === 1 && p.voided === 1 && p.disputed === 1;
}

/** L3 — export header. */
export function p2pTimeoutOutcomeCatalogExportHeader(): string {
  return 'p2p_timeout_outcome';
}

/** L3 — export lines. */
export function p2pTimeoutOutcomeCatalogExportLines(): readonly string[] {
  return [...P2P_TIMEOUT_OUTCOMES];
}

/** L3 — full export. */
export function p2pTimeoutOutcomeCatalogExportText(): string {
  return [p2pTimeoutOutcomeCatalogExportHeader(), ...p2pTimeoutOutcomeCatalogExportLines()].join('\n');
}

/** L3 — outcome declared. */
export function isDeclaredP2pTimeoutOutcome(outcome: string): boolean {
  return (P2P_TIMEOUT_OUTCOMES as readonly string[]).includes(outcome);
}
