/**
 * Identity L3 — pure affiliate freeze error-code catalog honesty (no DB I/O).
 *
 * Mirrors freeze-store.ts FreezeErrorCode.
 */

export const FREEZE_ERROR_CODES = ['freeze.invalid', 'freeze.already', 'freeze.not_frozen', 'freeze.not_found'] as const;
export type FreezeErrorCodeId = (typeof FREEZE_ERROR_CODES)[number];

/** L3 — catalog board. */
export function freezeErrorCatalogBoardCard(): {
  readonly codes: number;
  readonly hasAlready: number;
  readonly hasNotFound: number;
} {
  return {
    codes: FREEZE_ERROR_CODES.length,
    hasAlready: FREEZE_ERROR_CODES.includes('freeze.already') ? 1 : 0,
    hasNotFound: FREEZE_ERROR_CODES.includes('freeze.not_found') ? 1 : 0,
  };
}

/** L3 — status line. */
export function freezeErrorCatalogStatusLine(): string {
  const c = freezeErrorCatalogBoardCard();
  return `codes=${c.codes} already=${c.hasAlready} not_found=${c.hasNotFound}`;
}

/** L3 — parse status. */
export function parseFreezeErrorCatalogStatusLine(line: string): {
  readonly codes: number;
  readonly already: number;
  readonly notFound: number;
} | null {
  const m = line.trim().match(/^codes=(\d+) already=([01]) not_found=([01])$/);
  if (!m) return null;
  return {
    codes: Number(m[1]),
    already: Number(m[2]),
    notFound: Number(m[3]),
  };
}

/** L3 — true when status matches. */
export function freezeErrorCatalogStatusLineMatches(): boolean {
  const p = parseFreezeErrorCatalogStatusLine(freezeErrorCatalogStatusLine());
  if (!p) return false;
  const c = freezeErrorCatalogBoardCard();
  return p.codes === c.codes && p.already === c.hasAlready && p.notFound === c.hasNotFound;
}

/** L3 — four codes. */
export function freezeErrorCatalogStatusLineConsistent(line: string): boolean {
  const p = parseFreezeErrorCatalogStatusLine(line);
  if (!p) return false;
  return p.codes === 4 && p.already === 1 && p.notFound === 1;
}

/** L3 — export header. */
export function freezeErrorCatalogExportHeader(): string {
  return 'code';
}

/** L3 — export lines. */
export function freezeErrorCatalogExportLines(): readonly string[] {
  return [...FREEZE_ERROR_CODES];
}

/** L3 — full export. */
export function freezeErrorCatalogExportText(): string {
  return [freezeErrorCatalogExportHeader(), ...freezeErrorCatalogExportLines()].join('\n');
}

/** L3 — code declared. */
export function isDeclaredFreezeErrorCode(code: string): boolean {
  return (FREEZE_ERROR_CODES as readonly string[]).includes(code);
}
