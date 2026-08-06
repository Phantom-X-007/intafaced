/**
 * Academy L3 — pure canvas error-code catalog honesty (no scene invent).
 *
 * Mirrors canvas.ts CanvasErrorCode.
 */

export const CANVAS_ERROR_CODES = [
  'academy.scene_invalid',
  'academy.avatar_missing',
  'academy.avatar_exists',
  'academy.prop_missing',
  'academy.prop_exists',
  'academy.out_of_bounds',
] as const;
export type CanvasErrorCodeId = (typeof CANVAS_ERROR_CODES)[number];

/** L3 — catalog board. */
export function canvasErrorCatalogBoardCard(): {
  readonly codes: number;
  readonly hasOutOfBounds: number;
  readonly hasAvatarMissing: number;
  readonly hasPropExists: number;
} {
  return {
    codes: CANVAS_ERROR_CODES.length,
    hasOutOfBounds: CANVAS_ERROR_CODES.includes('academy.out_of_bounds') ? 1 : 0,
    hasAvatarMissing: CANVAS_ERROR_CODES.includes('academy.avatar_missing') ? 1 : 0,
    hasPropExists: CANVAS_ERROR_CODES.includes('academy.prop_exists') ? 1 : 0,
  };
}

/** L3 — status line. */
export function canvasErrorCatalogStatusLine(): string {
  const c = canvasErrorCatalogBoardCard();
  return `codes=${c.codes} out_of_bounds=${c.hasOutOfBounds} avatar_missing=${c.hasAvatarMissing} prop_exists=${c.hasPropExists}`;
}

/** L3 — parse status. */
export function parseCanvasErrorCatalogStatusLine(line: string): {
  readonly codes: number;
  readonly outOfBounds: number;
  readonly avatarMissing: number;
  readonly propExists: number;
} | null {
  const m = line.trim().match(/^codes=(\d+) out_of_bounds=([01]) avatar_missing=([01]) prop_exists=([01])$/);
  if (!m) return null;
  return {
    codes: Number(m[1]),
    outOfBounds: Number(m[2]),
    avatarMissing: Number(m[3]),
    propExists: Number(m[4]),
  };
}

/** L3 — true when status matches. */
export function canvasErrorCatalogStatusLineMatches(): boolean {
  const p = parseCanvasErrorCatalogStatusLine(canvasErrorCatalogStatusLine());
  if (!p) return false;
  const c = canvasErrorCatalogBoardCard();
  return (
    p.codes === c.codes && p.outOfBounds === c.hasOutOfBounds && p.avatarMissing === c.hasAvatarMissing && p.propExists === c.hasPropExists
  );
}

/** L3 — six codes. */
export function canvasErrorCatalogStatusLineConsistent(line: string): boolean {
  const p = parseCanvasErrorCatalogStatusLine(line);
  if (!p) return false;
  return p.codes === 6 && p.outOfBounds === 1;
}

/** L3 — export header. */
export function canvasErrorCatalogExportHeader(): string {
  return 'code';
}

/** L3 — export lines. */
export function canvasErrorCatalogExportLines(): readonly string[] {
  return [...CANVAS_ERROR_CODES];
}

/** L3 — full export. */
export function canvasErrorCatalogExportText(): string {
  return [canvasErrorCatalogExportHeader(), ...canvasErrorCatalogExportLines()].join('\n');
}

/** L3 — code declared. */
export function isDeclaredCanvasErrorCode(code: string): boolean {
  return (CANVAS_ERROR_CODES as readonly string[]).includes(code);
}
