/**
 * Contracts L3 — pure instrument kind catalog honesty (structural only).
 *
 * Mirrors instruments.ts instrument kinds: spot | futures | options.
 */

export const INSTRUMENT_KINDS = ['spot', 'futures', 'options'] as const;

/** L3 — catalog board. */
export function instrumentKindCatalogBoardCard(): {
  readonly kinds: number;
  readonly hasSpot: number;
  readonly hasFutures: number;
  readonly hasOptions: number;
} {
  return {
    kinds: INSTRUMENT_KINDS.length,
    hasSpot: INSTRUMENT_KINDS.includes('spot') ? 1 : 0,
    hasFutures: INSTRUMENT_KINDS.includes('futures') ? 1 : 0,
    hasOptions: INSTRUMENT_KINDS.includes('options') ? 1 : 0,
  };
}

/** L3 — status line. */
export function instrumentKindCatalogStatusLine(): string {
  const c = instrumentKindCatalogBoardCard();
  return `kinds=${c.kinds} spot=${c.hasSpot} futures=${c.hasFutures} options=${c.hasOptions}`;
}

/** L3 — parse status. */
export function parseInstrumentKindCatalogStatusLine(line: string): {
  readonly kinds: number;
  readonly spot: number;
  readonly futures: number;
  readonly options: number;
} | null {
  const m = line
    .trim()
    .match(/^kinds=(\d+) spot=([01]) futures=([01]) options=([01])$/);
  if (!m) return null;
  return {
    kinds: Number(m[1]),
    spot: Number(m[2]),
    futures: Number(m[3]),
    options: Number(m[4]),
  };
}

/** L3 — true when status matches. */
export function instrumentKindCatalogStatusLineMatches(): boolean {
  const p = parseInstrumentKindCatalogStatusLine(instrumentKindCatalogStatusLine());
  if (!p) return false;
  const c = instrumentKindCatalogBoardCard();
  return (
    p.kinds === c.kinds &&
    p.spot === c.hasSpot &&
    p.futures === c.hasFutures &&
    p.options === c.hasOptions
  );
}

/** L3 — three kinds. */
export function instrumentKindCatalogStatusLineConsistent(line: string): boolean {
  const p = parseInstrumentKindCatalogStatusLine(line);
  if (!p) return false;
  return p.kinds === 3 && p.spot === 1 && p.futures === 1 && p.options === 1;
}

/** L3 — export header. */
export function instrumentKindCatalogExportHeader(): string {
  return 'kind';
}

/** L3 — export lines. */
export function instrumentKindCatalogExportLines(): readonly string[] {
  return [...INSTRUMENT_KINDS];
}

/** L3 — full export. */
export function instrumentKindCatalogExportText(): string {
  return [instrumentKindCatalogExportHeader(), ...instrumentKindCatalogExportLines()].join('\n');
}

/** L3 — kind declared. */
export function isDeclaredInstrumentKind(kind: string): boolean {
  return (INSTRUMENT_KINDS as readonly string[]).includes(kind);
}
