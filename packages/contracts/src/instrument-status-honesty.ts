/**
 * Contracts L3 — pure instrument status catalog honesty.
 *
 * Mirrors instruments.ts instrumentStatusSchema: pending | active | halted | delisted.
 * Does not invent listing product law.
 */

export const INSTRUMENT_STATUSES = ['pending', 'active', 'halted', 'delisted'] as const;
export type InstrumentStatusId = (typeof INSTRUMENT_STATUSES)[number];

/** L3 — catalog board. */
export function instrumentStatusCatalogBoardCard(): {
  readonly statuses: number;
  readonly hasPending: number;
  readonly hasActive: number;
  readonly hasHalted: number;
  readonly hasDelisted: number;
} {
  return {
    statuses: INSTRUMENT_STATUSES.length,
    hasPending: INSTRUMENT_STATUSES.includes('pending') ? 1 : 0,
    hasActive: INSTRUMENT_STATUSES.includes('active') ? 1 : 0,
    hasHalted: INSTRUMENT_STATUSES.includes('halted') ? 1 : 0,
    hasDelisted: INSTRUMENT_STATUSES.includes('delisted') ? 1 : 0,
  };
}

/** L3 — status line. */
export function instrumentStatusCatalogStatusLine(): string {
  const c = instrumentStatusCatalogBoardCard();
  return `statuses=${c.statuses} pending=${c.hasPending} active=${c.hasActive} halted=${c.hasHalted} delisted=${c.hasDelisted}`;
}

/** L3 — parse status. */
export function parseInstrumentStatusCatalogStatusLine(line: string): {
  readonly statuses: number;
  readonly pending: number;
  readonly active: number;
  readonly halted: number;
  readonly delisted: number;
} | null {
  const m = line.trim().match(/^statuses=(\d+) pending=([01]) active=([01]) halted=([01]) delisted=([01])$/);
  if (!m) return null;
  return {
    statuses: Number(m[1]),
    pending: Number(m[2]),
    active: Number(m[3]),
    halted: Number(m[4]),
    delisted: Number(m[5]),
  };
}

/** L3 — true when status matches. */
export function instrumentStatusCatalogStatusLineMatches(): boolean {
  const p = parseInstrumentStatusCatalogStatusLine(instrumentStatusCatalogStatusLine());
  if (!p) return false;
  const c = instrumentStatusCatalogBoardCard();
  return (
    p.statuses === c.statuses &&
    p.pending === c.hasPending &&
    p.active === c.hasActive &&
    p.halted === c.hasHalted &&
    p.delisted === c.hasDelisted
  );
}

/** L3 — four statuses. */
export function instrumentStatusCatalogStatusLineConsistent(line: string): boolean {
  const p = parseInstrumentStatusCatalogStatusLine(line);
  if (!p) return false;
  return p.statuses === 4 && p.pending === 1 && p.active === 1 && p.halted === 1 && p.delisted === 1;
}

/** L3 — export header. */
export function instrumentStatusCatalogExportHeader(): string {
  return 'status';
}

/** L3 — export lines. */
export function instrumentStatusCatalogExportLines(): readonly string[] {
  return [...INSTRUMENT_STATUSES];
}

/** L3 — full export. */
export function instrumentStatusCatalogExportText(): string {
  return [instrumentStatusCatalogExportHeader(), ...instrumentStatusCatalogExportLines()].join('\n');
}

/** L3 — status declared. */
export function isDeclaredInstrumentStatus(status: string): boolean {
  return (INSTRUMENT_STATUSES as readonly string[]).includes(status);
}
