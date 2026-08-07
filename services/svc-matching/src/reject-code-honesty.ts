/**
 * Matching L3 — pure engine reject-code catalog honesty (structural only).
 *
 * Mirrors engine/types.ts REJECT_CODES (11 codes).
 * Does not invent money repair or fee law.
 */

export const REJECT_CODES = [
  'invalid_qty',
  'invalid_price',
  'missing_price',
  'unexpected_price',
  'missing_stop_price',
  'unexpected_stop_price',
  'invalid_tif',
  'duplicate_order_id',
  'post_only_would_cross',
  'fok_unfillable',
  'engine_disabled',
] as const;
export type RejectCodeId = (typeof REJECT_CODES)[number];

/** L3 — catalog board. */
export function rejectCodeCatalogBoardCard(): {
  readonly codes: number;
  readonly hasEngineDisabled: number;
  readonly hasFokUnfillable: number;
  readonly hasPostOnlyWouldCross: number;
  readonly hasDuplicate: number;
} {
  return {
    codes: REJECT_CODES.length,
    hasEngineDisabled: REJECT_CODES.includes('engine_disabled') ? 1 : 0,
    hasFokUnfillable: REJECT_CODES.includes('fok_unfillable') ? 1 : 0,
    hasPostOnlyWouldCross: REJECT_CODES.includes('post_only_would_cross') ? 1 : 0,
    hasDuplicate: REJECT_CODES.includes('duplicate_order_id') ? 1 : 0,
  };
}

/** L3 — status line. */
export function rejectCodeCatalogStatusLine(): string {
  const c = rejectCodeCatalogBoardCard();
  return `codes=${c.codes} engine_disabled=${c.hasEngineDisabled} fok_unfillable=${c.hasFokUnfillable} post_only_cross=${c.hasPostOnlyWouldCross} duplicate=${c.hasDuplicate}`;
}

/** L3 — parse status. */
export function parseRejectCodeCatalogStatusLine(line: string): {
  readonly codes: number;
  readonly engineDisabled: number;
  readonly fokUnfillable: number;
  readonly postOnlyCross: number;
  readonly duplicate: number;
} | null {
  const m = line.trim().match(/^codes=(\d+) engine_disabled=([01]) fok_unfillable=([01]) post_only_cross=([01]) duplicate=([01])$/);
  if (!m) return null;
  return {
    codes: Number(m[1]),
    engineDisabled: Number(m[2]),
    fokUnfillable: Number(m[3]),
    postOnlyCross: Number(m[4]),
    duplicate: Number(m[5]),
  };
}

/** L3 — true when status matches. */
export function rejectCodeCatalogStatusLineMatches(): boolean {
  const p = parseRejectCodeCatalogStatusLine(rejectCodeCatalogStatusLine());
  if (!p) return false;
  const c = rejectCodeCatalogBoardCard();
  return (
    p.codes === c.codes &&
    p.engineDisabled === c.hasEngineDisabled &&
    p.fokUnfillable === c.hasFokUnfillable &&
    p.postOnlyCross === c.hasPostOnlyWouldCross &&
    p.duplicate === c.hasDuplicate
  );
}

/** L3 — eleven tip codes; engine_disabled present. */
export function rejectCodeCatalogStatusLineConsistent(line: string): boolean {
  const p = parseRejectCodeCatalogStatusLine(line);
  if (!p) return false;
  return p.codes === 11 && p.engineDisabled === 1 && p.fokUnfillable === 1 && p.postOnlyCross === 1 && p.duplicate === 1;
}

/** L3 — export header. */
export function rejectCodeCatalogExportHeader(): string {
  return 'reject_code';
}

/** L3 — export lines. */
export function rejectCodeCatalogExportLines(): readonly string[] {
  return [...REJECT_CODES];
}

/** L3 — full export. */
export function rejectCodeCatalogExportText(): string {
  return [rejectCodeCatalogExportHeader(), ...rejectCodeCatalogExportLines()].join('\n');
}

/** L3 — code declared. */
export function isDeclaredRejectCode(code: string): boolean {
  return (REJECT_CODES as readonly string[]).includes(code);
}
