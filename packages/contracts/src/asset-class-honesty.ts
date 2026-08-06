/**
 * Contracts L3 — pure asset class catalog honesty (structural only).
 *
 * Mirrors instruments.ts ASSET_CLASSES.
 */

export const ASSET_CLASSES = ['crypto', 'commodity', 'forex'] as const;

/** L3 — catalog board. */
export function assetClassCatalogBoardCard(): {
  readonly classes: number;
  readonly hasCrypto: number;
  readonly hasCommodity: number;
  readonly hasForex: number;
} {
  return {
    classes: ASSET_CLASSES.length,
    hasCrypto: ASSET_CLASSES.includes('crypto') ? 1 : 0,
    hasCommodity: ASSET_CLASSES.includes('commodity') ? 1 : 0,
    hasForex: ASSET_CLASSES.includes('forex') ? 1 : 0,
  };
}

/** L3 — status line. */
export function assetClassCatalogStatusLine(): string {
  const c = assetClassCatalogBoardCard();
  return `classes=${c.classes} crypto=${c.hasCrypto} commodity=${c.hasCommodity} forex=${c.hasForex}`;
}

/** L3 — parse status. */
export function parseAssetClassCatalogStatusLine(line: string): {
  readonly classes: number;
  readonly crypto: number;
  readonly commodity: number;
  readonly forex: number;
} | null {
  const m = line.trim().match(/^classes=(\d+) crypto=([01]) commodity=([01]) forex=([01])$/);
  if (!m) return null;
  return {
    classes: Number(m[1]),
    crypto: Number(m[2]),
    commodity: Number(m[3]),
    forex: Number(m[4]),
  };
}

/** L3 — true when status matches. */
export function assetClassCatalogStatusLineMatches(): boolean {
  const p = parseAssetClassCatalogStatusLine(assetClassCatalogStatusLine());
  if (!p) return false;
  const c = assetClassCatalogBoardCard();
  return p.classes === c.classes && p.crypto === c.hasCrypto && p.commodity === c.hasCommodity && p.forex === c.hasForex;
}

/** L3 — three classes. */
export function assetClassCatalogStatusLineConsistent(line: string): boolean {
  const p = parseAssetClassCatalogStatusLine(line);
  if (!p) return false;
  return p.classes === 3 && p.crypto === 1 && p.commodity === 1 && p.forex === 1;
}

/** L3 — export header. */
export function assetClassCatalogExportHeader(): string {
  return 'class';
}

/** L3 — export lines. */
export function assetClassCatalogExportLines(): readonly string[] {
  return [...ASSET_CLASSES];
}

/** L3 — full export. */
export function assetClassCatalogExportText(): string {
  return [assetClassCatalogExportHeader(), ...assetClassCatalogExportLines()].join('\n');
}

/** L3 — class declared. */
export function isDeclaredAssetClass(cls: string): boolean {
  return (ASSET_CLASSES as readonly string[]).includes(cls);
}
