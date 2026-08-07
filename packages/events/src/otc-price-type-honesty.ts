/**
 * Events L3 — pure OTC price-type catalog honesty (structural only).
 *
 * Mirrors catalog.ts priceType: fixed | float.
 * Does not invent OTC rates, RFQ math, or product law.
 */

export const OTC_PRICE_TYPES = ['fixed', 'float'] as const;
export type OtcPriceTypeId = (typeof OTC_PRICE_TYPES)[number];

/** L3 — catalog board. */
export function otcPriceTypeCatalogBoardCard(): {
  readonly types: number;
  readonly hasFixed: number;
  readonly hasFloat: number;
} {
  return {
    types: OTC_PRICE_TYPES.length,
    hasFixed: OTC_PRICE_TYPES.includes('fixed') ? 1 : 0,
    hasFloat: OTC_PRICE_TYPES.includes('float') ? 1 : 0,
  };
}

/** L3 — status line. */
export function otcPriceTypeCatalogStatusLine(): string {
  const c = otcPriceTypeCatalogBoardCard();
  return `types=${c.types} fixed=${c.hasFixed} float=${c.hasFloat}`;
}

/** L3 — parse status. */
export function parseOtcPriceTypeCatalogStatusLine(line: string): {
  readonly types: number;
  readonly fixed: number;
  readonly float: number;
} | null {
  const m = line.trim().match(/^types=(\d+) fixed=([01]) float=([01])$/);
  if (!m) return null;
  return { types: Number(m[1]), fixed: Number(m[2]), float: Number(m[3]) };
}

/** L3 — true when status matches. */
export function otcPriceTypeCatalogStatusLineMatches(): boolean {
  const p = parseOtcPriceTypeCatalogStatusLine(otcPriceTypeCatalogStatusLine());
  if (!p) return false;
  const c = otcPriceTypeCatalogBoardCard();
  return p.types === c.types && p.fixed === c.hasFixed && p.float === c.hasFloat;
}

/** L3 — two types. */
export function otcPriceTypeCatalogStatusLineConsistent(line: string): boolean {
  const p = parseOtcPriceTypeCatalogStatusLine(line);
  if (!p) return false;
  return p.types === 2 && p.fixed === 1 && p.float === 1;
}

/** L3 — export header. */
export function otcPriceTypeCatalogExportHeader(): string {
  return 'otc_price_type';
}

/** L3 — export lines. */
export function otcPriceTypeCatalogExportLines(): readonly string[] {
  return [...OTC_PRICE_TYPES];
}

/** L3 — full export. */
export function otcPriceTypeCatalogExportText(): string {
  return [otcPriceTypeCatalogExportHeader(), ...otcPriceTypeCatalogExportLines()].join('\n');
}

/** L3 — type declared. */
export function isDeclaredOtcPriceType(type: string): boolean {
  return (OTC_PRICE_TYPES as readonly string[]).includes(type);
}
