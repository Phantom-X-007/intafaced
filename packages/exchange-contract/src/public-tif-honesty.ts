/**
 * Exchange-contract L3 — pure public time-in-force catalog honesty (structural only).
 *
 * Mirrors timeInForceSchema: GTC | IOC | FOK | PO.
 * Does not invent order policy money.
 */

export const PUBLIC_TIFS = ['GTC', 'IOC', 'FOK', 'PO'] as const;
export type PublicTifId = (typeof PUBLIC_TIFS)[number];

/** L3 — catalog board. */
export function publicTifCatalogBoardCard(): {
  readonly tifs: number;
  readonly hasGtc: number;
  readonly hasIoc: number;
  readonly hasFok: number;
  readonly hasPo: number;
} {
  return {
    tifs: PUBLIC_TIFS.length,
    hasGtc: PUBLIC_TIFS.includes('GTC') ? 1 : 0,
    hasIoc: PUBLIC_TIFS.includes('IOC') ? 1 : 0,
    hasFok: PUBLIC_TIFS.includes('FOK') ? 1 : 0,
    hasPo: PUBLIC_TIFS.includes('PO') ? 1 : 0,
  };
}

/** L3 — status line. */
export function publicTifCatalogStatusLine(): string {
  const c = publicTifCatalogBoardCard();
  return `tifs=${c.tifs} gtc=${c.hasGtc} ioc=${c.hasIoc} fok=${c.hasFok} po=${c.hasPo}`;
}

/** L3 — parse status. */
export function parsePublicTifCatalogStatusLine(line: string): {
  readonly tifs: number;
  readonly gtc: number;
  readonly ioc: number;
  readonly fok: number;
  readonly po: number;
} | null {
  const m = line.trim().match(/^tifs=(\d+) gtc=([01]) ioc=([01]) fok=([01]) po=([01])$/);
  if (!m) return null;
  return {
    tifs: Number(m[1]),
    gtc: Number(m[2]),
    ioc: Number(m[3]),
    fok: Number(m[4]),
    po: Number(m[5]),
  };
}

/** L3 — true when status matches. */
export function publicTifCatalogStatusLineMatches(): boolean {
  const p = parsePublicTifCatalogStatusLine(publicTifCatalogStatusLine());
  if (!p) return false;
  const c = publicTifCatalogBoardCard();
  return p.tifs === c.tifs && p.gtc === c.hasGtc && p.ioc === c.hasIoc && p.fok === c.hasFok && p.po === c.hasPo;
}

/** L3 — four public TIFs. */
export function publicTifCatalogStatusLineConsistent(line: string): boolean {
  const p = parsePublicTifCatalogStatusLine(line);
  if (!p) return false;
  return p.tifs === 4 && p.gtc === 1 && p.ioc === 1 && p.fok === 1 && p.po === 1;
}

/** L3 — export header. */
export function publicTifCatalogExportHeader(): string {
  return 'public_tif';
}

/** L3 — export lines. */
export function publicTifCatalogExportLines(): readonly string[] {
  return [...PUBLIC_TIFS];
}

/** L3 — full export. */
export function publicTifCatalogExportText(): string {
  return [publicTifCatalogExportHeader(), ...publicTifCatalogExportLines()].join('\n');
}

/** L3 — TIF declared. */
export function isDeclaredPublicTif(tif: string): boolean {
  return (PUBLIC_TIFS as readonly string[]).includes(tif);
}
