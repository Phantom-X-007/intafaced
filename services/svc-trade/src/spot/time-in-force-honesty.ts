/**
 * Trade L3 — pure time-in-force catalog honesty (structural only).
 *
 * Mirrors types.ts TimeInForce: GTC | IOC | FOK | PO.
 * Does not invent order policy or money fields.
 */

export const TIME_IN_FORCE = ['GTC', 'IOC', 'FOK', 'PO'] as const;
export type TimeInForceId = (typeof TIME_IN_FORCE)[number];

/** L3 — catalog board. */
export function timeInForceCatalogBoardCard(): {
  readonly tifs: number;
  readonly hasGtc: number;
  readonly hasIoc: number;
  readonly hasFok: number;
  readonly hasPo: number;
} {
  return {
    tifs: TIME_IN_FORCE.length,
    hasGtc: TIME_IN_FORCE.includes('GTC') ? 1 : 0,
    hasIoc: TIME_IN_FORCE.includes('IOC') ? 1 : 0,
    hasFok: TIME_IN_FORCE.includes('FOK') ? 1 : 0,
    hasPo: TIME_IN_FORCE.includes('PO') ? 1 : 0,
  };
}

/** L3 — status line. */
export function timeInForceCatalogStatusLine(): string {
  const c = timeInForceCatalogBoardCard();
  return `tifs=${c.tifs} gtc=${c.hasGtc} ioc=${c.hasIoc} fok=${c.hasFok} po=${c.hasPo}`;
}

/** L3 — parse status. */
export function parseTimeInForceCatalogStatusLine(line: string): {
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
export function timeInForceCatalogStatusLineMatches(): boolean {
  const p = parseTimeInForceCatalogStatusLine(timeInForceCatalogStatusLine());
  if (!p) return false;
  const c = timeInForceCatalogBoardCard();
  return p.tifs === c.tifs && p.gtc === c.hasGtc && p.ioc === c.hasIoc && p.fok === c.hasFok && p.po === c.hasPo;
}

/** L3 — four TIF values. */
export function timeInForceCatalogStatusLineConsistent(line: string): boolean {
  const p = parseTimeInForceCatalogStatusLine(line);
  if (!p) return false;
  return p.tifs === 4 && p.gtc === 1 && p.ioc === 1 && p.fok === 1 && p.po === 1;
}

/** L3 — export header. */
export function timeInForceCatalogExportHeader(): string {
  return 'time_in_force';
}

/** L3 — export lines. */
export function timeInForceCatalogExportLines(): readonly string[] {
  return [...TIME_IN_FORCE];
}

/** L3 — full export. */
export function timeInForceCatalogExportText(): string {
  return [timeInForceCatalogExportHeader(), ...timeInForceCatalogExportLines()].join('\n');
}

/** L3 — TIF declared. */
export function isDeclaredTimeInForce(tif: string): boolean {
  return (TIME_IN_FORCE as readonly string[]).includes(tif);
}
