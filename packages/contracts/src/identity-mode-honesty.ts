/**
 * Contracts L3 — pure identity mode catalog honesty.
 *
 * Mirrors identity.ts principalSummarySchema modes: trader | merchant | creator | student.
 * Does not invent rank perks or fee discounts.
 */

export const IDENTITY_MODES = ['trader', 'merchant', 'creator', 'student'] as const;
export type IdentityModeId = (typeof IDENTITY_MODES)[number];

/** L3 — catalog board. */
export function identityModeCatalogBoardCard(): {
  readonly modes: number;
  readonly hasTrader: number;
  readonly hasMerchant: number;
  readonly hasCreator: number;
  readonly hasStudent: number;
} {
  return {
    modes: IDENTITY_MODES.length,
    hasTrader: IDENTITY_MODES.includes('trader') ? 1 : 0,
    hasMerchant: IDENTITY_MODES.includes('merchant') ? 1 : 0,
    hasCreator: IDENTITY_MODES.includes('creator') ? 1 : 0,
    hasStudent: IDENTITY_MODES.includes('student') ? 1 : 0,
  };
}

/** L3 — status line. */
export function identityModeCatalogStatusLine(): string {
  const c = identityModeCatalogBoardCard();
  return `modes=${c.modes} trader=${c.hasTrader} merchant=${c.hasMerchant} creator=${c.hasCreator} student=${c.hasStudent}`;
}

/** L3 — parse status. */
export function parseIdentityModeCatalogStatusLine(line: string): {
  readonly modes: number;
  readonly trader: number;
  readonly merchant: number;
  readonly creator: number;
  readonly student: number;
} | null {
  const m = line.trim().match(/^modes=(\d+) trader=([01]) merchant=([01]) creator=([01]) student=([01])$/);
  if (!m) return null;
  return {
    modes: Number(m[1]),
    trader: Number(m[2]),
    merchant: Number(m[3]),
    creator: Number(m[4]),
    student: Number(m[5]),
  };
}

/** L3 — true when status matches. */
export function identityModeCatalogStatusLineMatches(): boolean {
  const p = parseIdentityModeCatalogStatusLine(identityModeCatalogStatusLine());
  if (!p) return false;
  const c = identityModeCatalogBoardCard();
  return (
    p.modes === c.modes &&
    p.trader === c.hasTrader &&
    p.merchant === c.hasMerchant &&
    p.creator === c.hasCreator &&
    p.student === c.hasStudent
  );
}

/** L3 — four modes. */
export function identityModeCatalogStatusLineConsistent(line: string): boolean {
  const p = parseIdentityModeCatalogStatusLine(line);
  if (!p) return false;
  return p.modes === 4 && p.trader === 1 && p.merchant === 1 && p.creator === 1 && p.student === 1;
}

/** L3 — export header. */
export function identityModeCatalogExportHeader(): string {
  return 'mode';
}

/** L3 — export lines. */
export function identityModeCatalogExportLines(): readonly string[] {
  return [...IDENTITY_MODES];
}

/** L3 — full export. */
export function identityModeCatalogExportText(): string {
  return [identityModeCatalogExportHeader(), ...identityModeCatalogExportLines()].join('\n');
}

/** L3 — mode declared. */
export function isDeclaredIdentityMode(mode: string): boolean {
  return (IDENTITY_MODES as readonly string[]).includes(mode);
}
