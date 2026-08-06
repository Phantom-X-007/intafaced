/**
 * Academy L3 — pure residency error-code catalog honesty (no desk I/O).
 *
 * Mirrors residency.ts ResidencyErrorCode.
 */

export const RESIDENCY_ERROR_CODES = [
  'academy.residency_invalid',
  'academy.residency_not_found',
  'academy.residency_already_open',
  'academy.residency_not_pending',
] as const;
export type ResidencyErrorCodeId = (typeof RESIDENCY_ERROR_CODES)[number];

/** L3 — catalog board. */
export function residencyErrorCatalogBoardCard(): {
  readonly codes: number;
  readonly hasInvalid: number;
  readonly hasNotFound: number;
  readonly hasAlreadyOpen: number;
} {
  return {
    codes: RESIDENCY_ERROR_CODES.length,
    hasInvalid: RESIDENCY_ERROR_CODES.includes('academy.residency_invalid') ? 1 : 0,
    hasNotFound: RESIDENCY_ERROR_CODES.includes('academy.residency_not_found') ? 1 : 0,
    hasAlreadyOpen: RESIDENCY_ERROR_CODES.includes('academy.residency_already_open') ? 1 : 0,
  };
}

/** L3 — status line. */
export function residencyErrorCatalogStatusLine(): string {
  const c = residencyErrorCatalogBoardCard();
  return `codes=${c.codes} invalid=${c.hasInvalid} not_found=${c.hasNotFound} already_open=${c.hasAlreadyOpen}`;
}

/** L3 — parse status. */
export function parseResidencyErrorCatalogStatusLine(line: string): {
  readonly codes: number;
  readonly invalid: number;
  readonly notFound: number;
  readonly alreadyOpen: number;
} | null {
  const m = line.trim().match(/^codes=(\d+) invalid=([01]) not_found=([01]) already_open=([01])$/);
  if (!m) return null;
  return {
    codes: Number(m[1]),
    invalid: Number(m[2]),
    notFound: Number(m[3]),
    alreadyOpen: Number(m[4]),
  };
}

/** L3 — true when status matches. */
export function residencyErrorCatalogStatusLineMatches(): boolean {
  const p = parseResidencyErrorCatalogStatusLine(residencyErrorCatalogStatusLine());
  if (!p) return false;
  const c = residencyErrorCatalogBoardCard();
  return p.codes === c.codes && p.invalid === c.hasInvalid && p.notFound === c.hasNotFound && p.alreadyOpen === c.hasAlreadyOpen;
}

/** L3 — four codes. */
export function residencyErrorCatalogStatusLineConsistent(line: string): boolean {
  const p = parseResidencyErrorCatalogStatusLine(line);
  if (!p) return false;
  return p.codes === 4 && p.invalid === 1 && p.notFound === 1;
}

/** L3 — export header. */
export function residencyErrorCatalogExportHeader(): string {
  return 'code';
}

/** L3 — export lines. */
export function residencyErrorCatalogExportLines(): readonly string[] {
  return [...RESIDENCY_ERROR_CODES];
}

/** L3 — full export. */
export function residencyErrorCatalogExportText(): string {
  return [residencyErrorCatalogExportHeader(), ...residencyErrorCatalogExportLines()].join('\n');
}

/** L3 — code declared. */
export function isDeclaredResidencyErrorCode(code: string): boolean {
  return (RESIDENCY_ERROR_CODES as readonly string[]).includes(code);
}
