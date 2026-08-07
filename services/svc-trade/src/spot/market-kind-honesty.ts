/**
 * Trade L3 — pure market-kind catalog honesty (structural only).
 *
 * Mirrors types.ts MarketKind: spot | futures | options.
 * Does not invent market listing law or money fields.
 */

export const MARKET_KINDS = ['spot', 'futures', 'options'] as const;
export type MarketKindId = (typeof MARKET_KINDS)[number];

/** L3 — catalog board. */
export function marketKindCatalogBoardCard(): {
  readonly kinds: number;
  readonly hasSpot: number;
  readonly hasFutures: number;
  readonly hasOptions: number;
} {
  return {
    kinds: MARKET_KINDS.length,
    hasSpot: MARKET_KINDS.includes('spot') ? 1 : 0,
    hasFutures: MARKET_KINDS.includes('futures') ? 1 : 0,
    hasOptions: MARKET_KINDS.includes('options') ? 1 : 0,
  };
}

/** L3 — status line. */
export function marketKindCatalogStatusLine(): string {
  const c = marketKindCatalogBoardCard();
  return `kinds=${c.kinds} spot=${c.hasSpot} futures=${c.hasFutures} options=${c.hasOptions}`;
}

/** L3 — parse status. */
export function parseMarketKindCatalogStatusLine(line: string): {
  readonly kinds: number;
  readonly spot: number;
  readonly futures: number;
  readonly options: number;
} | null {
  const m = line.trim().match(/^kinds=(\d+) spot=([01]) futures=([01]) options=([01])$/);
  if (!m) return null;
  return {
    kinds: Number(m[1]),
    spot: Number(m[2]),
    futures: Number(m[3]),
    options: Number(m[4]),
  };
}

/** L3 — true when status matches. */
export function marketKindCatalogStatusLineMatches(): boolean {
  const p = parseMarketKindCatalogStatusLine(marketKindCatalogStatusLine());
  if (!p) return false;
  const c = marketKindCatalogBoardCard();
  return p.kinds === c.kinds && p.spot === c.hasSpot && p.futures === c.hasFutures && p.options === c.hasOptions;
}

/** L3 — three kinds declared. */
export function marketKindCatalogStatusLineConsistent(line: string): boolean {
  const p = parseMarketKindCatalogStatusLine(line);
  if (!p) return false;
  return p.kinds === 3 && p.spot === 1 && p.futures === 1 && p.options === 1;
}

/** L3 — export header. */
export function marketKindCatalogExportHeader(): string {
  return 'market_kind';
}

/** L3 — export lines. */
export function marketKindCatalogExportLines(): readonly string[] {
  return [...MARKET_KINDS];
}

/** L3 — full export. */
export function marketKindCatalogExportText(): string {
  return [marketKindCatalogExportHeader(), ...marketKindCatalogExportLines()].join('\n');
}

/** L3 — kind declared. */
export function isDeclaredMarketKind(kind: string): boolean {
  return (MARKET_KINDS as readonly string[]).includes(kind);
}
