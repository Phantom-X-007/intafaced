/**
 * Contracts L3 — pure instrument unit catalog honesty (structural only).
 *
 * Mirrors instruments.ts INSTRUMENT_UNITS.
 */

export const INSTRUMENT_UNITS = ['unit', 'troy_ounce', 'barrel', 'mmbtu'] as const;

/** L3 — catalog board. */
export function instrumentUnitCatalogBoardCard(): {
  readonly units: number;
  readonly hasUnit: number;
  readonly hasTroyOunce: number;
  readonly hasBarrel: number;
} {
  return {
    units: INSTRUMENT_UNITS.length,
    hasUnit: INSTRUMENT_UNITS.includes('unit') ? 1 : 0,
    hasTroyOunce: INSTRUMENT_UNITS.includes('troy_ounce') ? 1 : 0,
    hasBarrel: INSTRUMENT_UNITS.includes('barrel') ? 1 : 0,
  };
}

/** L3 — status line. */
export function instrumentUnitCatalogStatusLine(): string {
  const c = instrumentUnitCatalogBoardCard();
  return `units=${c.units} unit=${c.hasUnit} troy_ounce=${c.hasTroyOunce} barrel=${c.hasBarrel}`;
}

/** L3 — parse status. */
export function parseInstrumentUnitCatalogStatusLine(line: string): {
  readonly units: number;
  readonly unit: number;
  readonly troyOunce: number;
  readonly barrel: number;
} | null {
  const m = line
    .trim()
    .match(/^units=(\d+) unit=([01]) troy_ounce=([01]) barrel=([01])$/);
  if (!m) return null;
  return {
    units: Number(m[1]),
    unit: Number(m[2]),
    troyOunce: Number(m[3]),
    barrel: Number(m[4]),
  };
}

/** L3 — true when status matches. */
export function instrumentUnitCatalogStatusLineMatches(): boolean {
  const p = parseInstrumentUnitCatalogStatusLine(instrumentUnitCatalogStatusLine());
  if (!p) return false;
  const c = instrumentUnitCatalogBoardCard();
  return (
    p.units === c.units &&
    p.unit === c.hasUnit &&
    p.troyOunce === c.hasTroyOunce &&
    p.barrel === c.hasBarrel
  );
}

/** L3 — four units. */
export function instrumentUnitCatalogStatusLineConsistent(line: string): boolean {
  const p = parseInstrumentUnitCatalogStatusLine(line);
  if (!p) return false;
  return p.units === 4 && p.unit === 1 && p.troyOunce === 1;
}

/** L3 — export header. */
export function instrumentUnitCatalogExportHeader(): string {
  return 'unit';
}

/** L3 — export lines. */
export function instrumentUnitCatalogExportLines(): readonly string[] {
  return [...INSTRUMENT_UNITS];
}

/** L3 — full export. */
export function instrumentUnitCatalogExportText(): string {
  return [instrumentUnitCatalogExportHeader(), ...instrumentUnitCatalogExportLines()].join('\n');
}

/** L3 — unit declared. */
export function isDeclaredInstrumentUnit(unit: string): boolean {
  return (INSTRUMENT_UNITS as readonly string[]).includes(unit);
}
