/**
 * Academy L3 — pure cert error-code catalog honesty (no XP invent).
 *
 * Mirrors progress.ts CertErrorCode. Stage-1 has no ledger/XP grant here.
 */

export const CERT_ERROR_CODES = [
  'academy.cert_not_found',
  'academy.cert_incomplete',
  'academy.cert_invalid',
  'academy.cert_already_granted',
] as const;
export type CertErrorCodeId = (typeof CERT_ERROR_CODES)[number];

/** L3 — catalog board. */
export function certErrorCatalogBoardCard(): {
  readonly codes: number;
  readonly hasIncomplete: number;
  readonly hasAlreadyGranted: number;
  readonly hasXpCode: number;
} {
  return {
    codes: CERT_ERROR_CODES.length,
    hasIncomplete: CERT_ERROR_CODES.includes('academy.cert_incomplete') ? 1 : 0,
    hasAlreadyGranted: CERT_ERROR_CODES.includes('academy.cert_already_granted') ? 1 : 0,
    hasXpCode: 0,
  };
}

/** L3 — status line. */
export function certErrorCatalogStatusLine(): string {
  const c = certErrorCatalogBoardCard();
  return `codes=${c.codes} incomplete=${c.hasIncomplete} already_granted=${c.hasAlreadyGranted} xp=${c.hasXpCode}`;
}

/** L3 — parse status. */
export function parseCertErrorCatalogStatusLine(line: string): {
  readonly codes: number;
  readonly incomplete: number;
  readonly alreadyGranted: number;
  readonly xp: number;
} | null {
  const m = line.trim().match(/^codes=(\d+) incomplete=([01]) already_granted=([01]) xp=([01])$/);
  if (!m) return null;
  return {
    codes: Number(m[1]),
    incomplete: Number(m[2]),
    alreadyGranted: Number(m[3]),
    xp: Number(m[4]),
  };
}

/** L3 — true when status matches. */
export function certErrorCatalogStatusLineMatches(): boolean {
  const p = parseCertErrorCatalogStatusLine(certErrorCatalogStatusLine());
  if (!p) return false;
  const c = certErrorCatalogBoardCard();
  return p.codes === c.codes && p.incomplete === c.hasIncomplete && p.alreadyGranted === c.hasAlreadyGranted && p.xp === c.hasXpCode;
}

/** L3 — Stage-1 has no XP error code here. */
export function certErrorCatalogStatusLineConsistent(line: string): boolean {
  const p = parseCertErrorCatalogStatusLine(line);
  if (!p) return false;
  return p.xp === 0 && p.codes === 4;
}

/** L3 — export header. */
export function certErrorCatalogExportHeader(): string {
  return 'code';
}

/** L3 — export lines. */
export function certErrorCatalogExportLines(): readonly string[] {
  return [...CERT_ERROR_CODES];
}

/** L3 — full export. */
export function certErrorCatalogExportText(): string {
  return [certErrorCatalogExportHeader(), ...certErrorCatalogExportLines()].join('\n');
}

/** L3 — code declared. */
export function isDeclaredCertErrorCode(code: string): boolean {
  return (CERT_ERROR_CODES as readonly string[]).includes(code);
}
