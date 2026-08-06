/**
 * Contracts L3 — pure instrument catalog honesty boards (no market I/O).
 *
 * Structural counts only — does not invent prices, ticks, or listings.
 * Catalog enums mirror instruments.ts.
 */

export const ASSET_CLASS_CATALOG = ['crypto', 'commodity', 'forex'] as const;
export const INSTRUMENT_UNIT_CATALOG = ['unit', 'troy_ounce', 'barrel', 'mmbtu'] as const;
export const INSTRUMENT_KIND_CATALOG = ['spot', 'futures', 'options'] as const;
export const INSTRUMENT_STATUS_CATALOG = ['pending', 'active', 'halted', 'delisted'] as const;
export const SCHEDULE_KEY_CATALOG = ['crypto-24x7', 'fx-global', 'cme-globex'] as const;

export type InstrumentBoardInput = {
  readonly assetClass: (typeof ASSET_CLASS_CATALOG)[number];
  readonly kind: (typeof INSTRUMENT_KIND_CATALOG)[number];
  readonly status: (typeof INSTRUMENT_STATUS_CATALOG)[number];
  readonly unit: (typeof INSTRUMENT_UNIT_CATALOG)[number];
};

/** L3 — enum catalog board. */
export function instrumentEnumCatalogBoardCard(): {
  readonly assetClasses: number;
  readonly units: number;
  readonly kinds: number;
  readonly statuses: number;
  readonly schedules: number;
} {
  return {
    assetClasses: ASSET_CLASS_CATALOG.length,
    units: INSTRUMENT_UNIT_CATALOG.length,
    kinds: INSTRUMENT_KIND_CATALOG.length,
    statuses: INSTRUMENT_STATUS_CATALOG.length,
    schedules: SCHEDULE_KEY_CATALOG.length,
  };
}

/** L3 — enum catalog status line. */
export function instrumentEnumCatalogStatusLine(): string {
  const c = instrumentEnumCatalogBoardCard();
  return `asset_classes=${c.assetClasses} units=${c.units} kinds=${c.kinds} statuses=${c.statuses} schedules=${c.schedules}`;
}

/** L3 — parse enum catalog. */
export function parseInstrumentEnumCatalogStatusLine(line: string): {
  readonly assetClasses: number;
  readonly units: number;
  readonly kinds: number;
  readonly statuses: number;
  readonly schedules: number;
} | null {
  const m = line
    .trim()
    .match(
      /^asset_classes=(\d+) units=(\d+) kinds=(\d+) statuses=(\d+) schedules=(\d+)$/,
    );
  if (!m) return null;
  return {
    assetClasses: Number(m[1]),
    units: Number(m[2]),
    kinds: Number(m[3]),
    statuses: Number(m[4]),
    schedules: Number(m[5]),
  };
}

/** L3 — true when enum catalog matches. */
export function instrumentEnumCatalogStatusLineMatches(): boolean {
  const p = parseInstrumentEnumCatalogStatusLine(instrumentEnumCatalogStatusLine());
  if (!p) return false;
  const c = instrumentEnumCatalogBoardCard();
  return (
    p.assetClasses === c.assetClasses &&
    p.units === c.units &&
    p.kinds === c.kinds &&
    p.statuses === c.statuses &&
    p.schedules === c.schedules
  );
}

/** L3 — status histogram for a fixture catalogue. */
export function instrumentStatusHistogram(
  items: readonly InstrumentBoardInput[],
): Readonly<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const i of items) out[i.status] = (out[i.status] ?? 0) + 1;
  return out;
}

/** L3 — class histogram. */
export function instrumentClassHistogram(
  items: readonly InstrumentBoardInput[],
): Readonly<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const i of items) out[i.assetClass] = (out[i.assetClass] ?? 0) + 1;
  return out;
}

/** L3 — board card for fixture catalogue. */
export function instrumentCatalogueBoardCard(items: readonly InstrumentBoardInput[]): {
  readonly instruments: number;
  readonly active: number;
  readonly halted: number;
  readonly crypto: number;
  readonly commodity: number;
  readonly forex: number;
} {
  const sh = instrumentStatusHistogram(items);
  const ch = instrumentClassHistogram(items);
  return {
    instruments: items.length,
    active: sh.active ?? 0,
    halted: sh.halted ?? 0,
    crypto: ch.crypto ?? 0,
    commodity: ch.commodity ?? 0,
    forex: ch.forex ?? 0,
  };
}

/** L3 — status line. */
export function instrumentCatalogueStatusLine(items: readonly InstrumentBoardInput[]): string {
  const c = instrumentCatalogueBoardCard(items);
  return `instruments=${c.instruments} active=${c.active} halted=${c.halted} crypto=${c.crypto} commodity=${c.commodity} forex=${c.forex}`;
}

/** L3 — parse catalogue status. */
export function parseInstrumentCatalogueStatusLine(line: string): {
  readonly instruments: number;
  readonly active: number;
  readonly halted: number;
  readonly crypto: number;
  readonly commodity: number;
  readonly forex: number;
} | null {
  const m = line
    .trim()
    .match(
      /^instruments=(\d+) active=(\d+) halted=(\d+) crypto=(\d+) commodity=(\d+) forex=(\d+)$/,
    );
  if (!m) return null;
  return {
    instruments: Number(m[1]),
    active: Number(m[2]),
    halted: Number(m[3]),
    crypto: Number(m[4]),
    commodity: Number(m[5]),
    forex: Number(m[6]),
  };
}

/** L3 — true when status matches. */
export function instrumentCatalogueStatusLineMatches(
  items: readonly InstrumentBoardInput[],
): boolean {
  const p = parseInstrumentCatalogueStatusLine(instrumentCatalogueStatusLine(items));
  if (!p) return false;
  const c = instrumentCatalogueBoardCard(items);
  return (
    p.instruments === c.instruments &&
    p.active === c.active &&
    p.halted === c.halted &&
    p.crypto === c.crypto &&
    p.commodity === c.commodity &&
    p.forex === c.forex
  );
}

/** L3 — class counts sum ≤ instruments. */
export function instrumentCatalogueStatusLineConsistent(line: string): boolean {
  const p = parseInstrumentCatalogueStatusLine(line);
  if (!p) return false;
  return p.crypto + p.commodity + p.forex === p.instruments && p.active + p.halted <= p.instruments;
}

/** L3 — export header. */
export function instrumentCatalogueExportHeader(): string {
  return 'instruments,active,halted,crypto,commodity,forex';
}

/** L3 — export line. */
export function instrumentCatalogueExportLine(items: readonly InstrumentBoardInput[]): string {
  const c = instrumentCatalogueBoardCard(items);
  return `${c.instruments},${c.active},${c.halted},${c.crypto},${c.commodity},${c.forex}`;
}

/** L3 — full export. */
export function instrumentCatalogueExportText(items: readonly InstrumentBoardInput[]): string {
  return [instrumentCatalogueExportHeader(), instrumentCatalogueExportLine(items)].join('\n');
}

/** L3 — count in range. */
export function instrumentCountInRange(
  items: readonly InstrumentBoardInput[],
  min: number,
  max: number,
): boolean {
  if (min > max) return false;
  const n = items.length;
  return n >= min && n <= max;
}
