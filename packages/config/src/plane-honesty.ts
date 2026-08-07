/**
 * Config L3 — pure plane catalog honesty (structural only).
 *
 * Mirrors modules.ts PLANES: fiat | protocol.
 * Does not invent jurisdiction matrix content.
 */

export const PLANES = ['fiat', 'protocol'] as const;
export type PlaneId = (typeof PLANES)[number];

/** L3 — catalog board. */
export function planeCatalogBoardCard(): {
  readonly planes: number;
  readonly hasFiat: number;
  readonly hasProtocol: number;
} {
  return {
    planes: PLANES.length,
    hasFiat: PLANES.includes('fiat') ? 1 : 0,
    hasProtocol: PLANES.includes('protocol') ? 1 : 0,
  };
}

/** L3 — status line. */
export function planeCatalogStatusLine(): string {
  const c = planeCatalogBoardCard();
  return `planes=${c.planes} fiat=${c.hasFiat} protocol=${c.hasProtocol}`;
}

/** L3 — parse status. */
export function parsePlaneCatalogStatusLine(line: string): {
  readonly planes: number;
  readonly fiat: number;
  readonly protocol: number;
} | null {
  const m = line.trim().match(/^planes=(\d+) fiat=([01]) protocol=([01])$/);
  if (!m) return null;
  return {
    planes: Number(m[1]),
    fiat: Number(m[2]),
    protocol: Number(m[3]),
  };
}

/** L3 — true when status matches. */
export function planeCatalogStatusLineMatches(): boolean {
  const p = parsePlaneCatalogStatusLine(planeCatalogStatusLine());
  if (!p) return false;
  const c = planeCatalogBoardCard();
  return p.planes === c.planes && p.fiat === c.hasFiat && p.protocol === c.hasProtocol;
}

/** L3 — two planes. */
export function planeCatalogStatusLineConsistent(line: string): boolean {
  const p = parsePlaneCatalogStatusLine(line);
  if (!p) return false;
  return p.planes === 2 && p.fiat === 1 && p.protocol === 1;
}

/** L3 — export header. */
export function planeCatalogExportHeader(): string {
  return 'plane';
}

/** L3 — export lines. */
export function planeCatalogExportLines(): readonly string[] {
  return [...PLANES];
}

/** L3 — full export. */
export function planeCatalogExportText(): string {
  return [planeCatalogExportHeader(), ...planeCatalogExportLines()].join('\n');
}

/** L3 — plane declared. */
export function isDeclaredPlane(p: string): boolean {
  return (PLANES as readonly string[]).includes(p);
}
