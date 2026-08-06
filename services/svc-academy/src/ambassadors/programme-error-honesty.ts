/**
 * Academy L3 — pure ambassador programme error-code catalog honesty (no pay).
 *
 * Mirrors programme.ts AmbassadorProgrammeErrorCode.
 */

export const AMBASSADOR_PROGRAMME_ERROR_CODES = [
  'academy.ambassador_not_found',
  'academy.ambassador_already_active',
  'academy.ambassador_already_frozen',
  'academy.ambassador_invalid',
] as const;
export type AmbassadorProgrammeErrorCodeId = (typeof AMBASSADOR_PROGRAMME_ERROR_CODES)[number];

/** L3 — catalog board. */
export function programmeErrorCatalogBoardCard(): {
  readonly codes: number;
  readonly hasNotFound: number;
  readonly hasAlreadyActive: number;
  readonly hasPayCode: number;
} {
  return {
    codes: AMBASSADOR_PROGRAMME_ERROR_CODES.length,
    hasNotFound: AMBASSADOR_PROGRAMME_ERROR_CODES.includes('academy.ambassador_not_found') ? 1 : 0,
    hasAlreadyActive: AMBASSADOR_PROGRAMME_ERROR_CODES.includes('academy.ambassador_already_active') ? 1 : 0,
    hasPayCode: 0,
  };
}

/** L3 — status line. */
export function programmeErrorCatalogStatusLine(): string {
  const c = programmeErrorCatalogBoardCard();
  return `codes=${c.codes} not_found=${c.hasNotFound} already_active=${c.hasAlreadyActive} pay=${c.hasPayCode}`;
}

/** L3 — parse status. */
export function parseProgrammeErrorCatalogStatusLine(line: string): {
  readonly codes: number;
  readonly notFound: number;
  readonly alreadyActive: number;
  readonly pay: number;
} | null {
  const m = line.trim().match(/^codes=(\d+) not_found=([01]) already_active=([01]) pay=([01])$/);
  if (!m) return null;
  return {
    codes: Number(m[1]),
    notFound: Number(m[2]),
    alreadyActive: Number(m[3]),
    pay: Number(m[4]),
  };
}

/** L3 — true when status matches. */
export function programmeErrorCatalogStatusLineMatches(): boolean {
  const p = parseProgrammeErrorCatalogStatusLine(programmeErrorCatalogStatusLine());
  if (!p) return false;
  const c = programmeErrorCatalogBoardCard();
  return p.codes === c.codes && p.notFound === c.hasNotFound && p.alreadyActive === c.hasAlreadyActive && p.pay === c.hasPayCode;
}

/** L3 — Stage-1 has no pay error code. */
export function programmeErrorCatalogStatusLineConsistent(line: string): boolean {
  const p = parseProgrammeErrorCatalogStatusLine(line);
  if (!p) return false;
  return p.pay === 0 && p.codes === 4;
}

/** L3 — export header. */
export function programmeErrorCatalogExportHeader(): string {
  return 'code';
}

/** L3 — export lines. */
export function programmeErrorCatalogExportLines(): readonly string[] {
  return [...AMBASSADOR_PROGRAMME_ERROR_CODES];
}

/** L3 — full export. */
export function programmeErrorCatalogExportText(): string {
  return [programmeErrorCatalogExportHeader(), ...programmeErrorCatalogExportLines()].join('\n');
}

/** L3 — code declared. */
export function isDeclaredProgrammeErrorCode(code: string): boolean {
  return (AMBASSADOR_PROGRAMME_ERROR_CODES as readonly string[]).includes(code);
}
