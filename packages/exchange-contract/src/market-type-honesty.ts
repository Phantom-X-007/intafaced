/**
 * Exchange-contract L3 — pure public market-type catalog honesty (structural only).
 *
 * Mirrors marketTypeSchema: spot | swap | future | option (CCXT unified).
 * Distinct from svc-trade MarketKind (spot|futures|options) — product layer.
 * Does not invent listing money.
 */

export const PUBLIC_MARKET_TYPES = ['spot', 'swap', 'future', 'option'] as const;
export type PublicMarketTypeId = (typeof PUBLIC_MARKET_TYPES)[number];

/** L3 — catalog board. */
export function publicMarketTypeCatalogBoardCard(): {
  readonly types: number;
  readonly hasSpot: number;
  readonly hasSwap: number;
  readonly hasFuture: number;
  readonly hasOption: number;
} {
  return {
    types: PUBLIC_MARKET_TYPES.length,
    hasSpot: PUBLIC_MARKET_TYPES.includes('spot') ? 1 : 0,
    hasSwap: PUBLIC_MARKET_TYPES.includes('swap') ? 1 : 0,
    hasFuture: PUBLIC_MARKET_TYPES.includes('future') ? 1 : 0,
    hasOption: PUBLIC_MARKET_TYPES.includes('option') ? 1 : 0,
  };
}

/** L3 — status line. */
export function publicMarketTypeCatalogStatusLine(): string {
  const c = publicMarketTypeCatalogBoardCard();
  return `types=${c.types} spot=${c.hasSpot} swap=${c.hasSwap} future=${c.hasFuture} option=${c.hasOption}`;
}

/** L3 — parse status. */
export function parsePublicMarketTypeCatalogStatusLine(line: string): {
  readonly types: number;
  readonly spot: number;
  readonly swap: number;
  readonly future: number;
  readonly option: number;
} | null {
  const m = line.trim().match(/^types=(\d+) spot=([01]) swap=([01]) future=([01]) option=([01])$/);
  if (!m) return null;
  return {
    types: Number(m[1]),
    spot: Number(m[2]),
    swap: Number(m[3]),
    future: Number(m[4]),
    option: Number(m[5]),
  };
}

/** L3 — true when status matches. */
export function publicMarketTypeCatalogStatusLineMatches(): boolean {
  const p = parsePublicMarketTypeCatalogStatusLine(publicMarketTypeCatalogStatusLine());
  if (!p) return false;
  const c = publicMarketTypeCatalogBoardCard();
  return p.types === c.types && p.spot === c.hasSpot && p.swap === c.hasSwap && p.future === c.hasFuture && p.option === c.hasOption;
}

/** L3 — four public market types. */
export function publicMarketTypeCatalogStatusLineConsistent(line: string): boolean {
  const p = parsePublicMarketTypeCatalogStatusLine(line);
  if (!p) return false;
  return p.types === 4 && p.spot === 1 && p.swap === 1 && p.future === 1 && p.option === 1;
}

/** L3 — export header. */
export function publicMarketTypeCatalogExportHeader(): string {
  return 'public_market_type';
}

/** L3 — export lines. */
export function publicMarketTypeCatalogExportLines(): readonly string[] {
  return [...PUBLIC_MARKET_TYPES];
}

/** L3 — full export. */
export function publicMarketTypeCatalogExportText(): string {
  return [publicMarketTypeCatalogExportHeader(), ...publicMarketTypeCatalogExportLines()].join('\n');
}

/** L3 — type declared. */
export function isDeclaredPublicMarketType(t: string): boolean {
  return (PUBLIC_MARKET_TYPES as readonly string[]).includes(t);
}
