/**
 * Identity L3 — pure referral error-code catalog honesty (no tree invent).
 *
 * Mirrors referral-tree.ts ReferralErrorCode.
 */

export const REFERRAL_ERROR_CODES = [
  'referral.self',
  'referral.cycle',
  'referral.depth',
  'referral.already_set',
  'referral.unknown_referrer',
  'referral.invalid',
] as const;
export type ReferralErrorCodeId = (typeof REFERRAL_ERROR_CODES)[number];

/** L3 — catalog board. */
export function referralErrorCatalogBoardCard(): {
  readonly codes: number;
  readonly hasCycle: number;
  readonly hasDepth: number;
  readonly hasSelf: number;
} {
  return {
    codes: REFERRAL_ERROR_CODES.length,
    hasCycle: REFERRAL_ERROR_CODES.includes('referral.cycle') ? 1 : 0,
    hasDepth: REFERRAL_ERROR_CODES.includes('referral.depth') ? 1 : 0,
    hasSelf: REFERRAL_ERROR_CODES.includes('referral.self') ? 1 : 0,
  };
}

/** L3 — status line. */
export function referralErrorCatalogStatusLine(): string {
  const c = referralErrorCatalogBoardCard();
  return `codes=${c.codes} cycle=${c.hasCycle} depth=${c.hasDepth} self=${c.hasSelf}`;
}

/** L3 — parse status. */
export function parseReferralErrorCatalogStatusLine(line: string): {
  readonly codes: number;
  readonly cycle: number;
  readonly depth: number;
  readonly self: number;
} | null {
  const m = line.trim().match(/^codes=(\d+) cycle=([01]) depth=([01]) self=([01])$/);
  if (!m) return null;
  return {
    codes: Number(m[1]),
    cycle: Number(m[2]),
    depth: Number(m[3]),
    self: Number(m[4]),
  };
}

/** L3 — true when status matches. */
export function referralErrorCatalogStatusLineMatches(): boolean {
  const p = parseReferralErrorCatalogStatusLine(referralErrorCatalogStatusLine());
  if (!p) return false;
  const c = referralErrorCatalogBoardCard();
  return p.codes === c.codes && p.cycle === c.hasCycle && p.depth === c.hasDepth && p.self === c.hasSelf;
}

/** L3 — six codes including cycle/depth/self. */
export function referralErrorCatalogStatusLineConsistent(line: string): boolean {
  const p = parseReferralErrorCatalogStatusLine(line);
  if (!p) return false;
  return p.codes === 6 && p.cycle === 1 && p.depth === 1 && p.self === 1;
}

/** L3 — export header. */
export function referralErrorCatalogExportHeader(): string {
  return 'code';
}

/** L3 — export lines. */
export function referralErrorCatalogExportLines(): readonly string[] {
  return [...REFERRAL_ERROR_CODES];
}

/** L3 — full export. */
export function referralErrorCatalogExportText(): string {
  return [referralErrorCatalogExportHeader(), ...referralErrorCatalogExportLines()].join('\n');
}

/** L3 — code declared. */
export function isDeclaredReferralErrorCode(code: string): boolean {
  return (REFERRAL_ERROR_CODES as readonly string[]).includes(code);
}
