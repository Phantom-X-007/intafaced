/**
 * Support L3 — pure KB catalog error-code honesty (no invent articles).
 *
 * Mirrors kb-catalog.ts KbCatalogErrorCode.
 */

export const KB_CATALOG_ERROR_CODES = ['support.kb_invalid', 'support.kb_vendor_name'] as const;
export type KbCatalogErrorCodeId = (typeof KB_CATALOG_ERROR_CODES)[number];

/** L3 — catalog board. */
export function kbErrorCatalogBoardCard(): {
  readonly codes: number;
  readonly hasInvalid: number;
  readonly hasVendorName: number;
} {
  return {
    codes: KB_CATALOG_ERROR_CODES.length,
    hasInvalid: KB_CATALOG_ERROR_CODES.includes('support.kb_invalid') ? 1 : 0,
    hasVendorName: KB_CATALOG_ERROR_CODES.includes('support.kb_vendor_name') ? 1 : 0,
  };
}

/** L3 — status line. */
export function kbErrorCatalogStatusLine(): string {
  const c = kbErrorCatalogBoardCard();
  return `codes=${c.codes} invalid=${c.hasInvalid} vendor_name=${c.hasVendorName}`;
}

/** L3 — parse status. */
export function parseKbErrorCatalogStatusLine(line: string): {
  readonly codes: number;
  readonly invalid: number;
  readonly vendorName: number;
} | null {
  const m = line.trim().match(/^codes=(\d+) invalid=([01]) vendor_name=([01])$/);
  if (!m) return null;
  return {
    codes: Number(m[1]),
    invalid: Number(m[2]),
    vendorName: Number(m[3]),
  };
}

/** L3 — true when status matches. */
export function kbErrorCatalogStatusLineMatches(): boolean {
  const p = parseKbErrorCatalogStatusLine(kbErrorCatalogStatusLine());
  if (!p) return false;
  const c = kbErrorCatalogBoardCard();
  return p.codes === c.codes && p.invalid === c.hasInvalid && p.vendorName === c.hasVendorName;
}

/** L3 — vendor name refuse is load-bearing (§0.7). */
export function kbErrorCatalogStatusLineConsistent(line: string): boolean {
  const p = parseKbErrorCatalogStatusLine(line);
  if (!p) return false;
  return p.codes === 2 && p.vendorName === 1 && p.invalid === 1;
}

/** L3 — export header. */
export function kbErrorCatalogExportHeader(): string {
  return 'code';
}

/** L3 — export lines. */
export function kbErrorCatalogExportLines(): readonly string[] {
  return [...KB_CATALOG_ERROR_CODES];
}

/** L3 — full export. */
export function kbErrorCatalogExportText(): string {
  return [kbErrorCatalogExportHeader(), ...kbErrorCatalogExportLines()].join('\n');
}

/** L3 — code declared. */
export function isDeclaredKbErrorCode(code: string): boolean {
  return (KB_CATALOG_ERROR_CODES as readonly string[]).includes(code);
}
