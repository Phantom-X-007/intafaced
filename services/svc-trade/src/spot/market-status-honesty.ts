/**
 * Trade L3 — pure market-status catalog honesty (structural only).
 *
 * Mirrors types.ts MarketStatus: pending | active | halted | delisted.
 * Does not invent listing law or money fields.
 */

export const MARKET_STATUSES = ['pending', 'active', 'halted', 'delisted'] as const;
export type MarketStatusId = (typeof MARKET_STATUSES)[number];

/** L3 — catalog board. */
export function marketStatusCatalogBoardCard(): {
  readonly statuses: number;
  readonly hasPending: number;
  readonly hasActive: number;
  readonly hasHalted: number;
  readonly hasDelisted: number;
} {
  return {
    statuses: MARKET_STATUSES.length,
    hasPending: MARKET_STATUSES.includes('pending') ? 1 : 0,
    hasActive: MARKET_STATUSES.includes('active') ? 1 : 0,
    hasHalted: MARKET_STATUSES.includes('halted') ? 1 : 0,
    hasDelisted: MARKET_STATUSES.includes('delisted') ? 1 : 0,
  };
}

/** L3 — status line. */
export function marketStatusCatalogStatusLine(): string {
  const c = marketStatusCatalogBoardCard();
  return `statuses=${c.statuses} pending=${c.hasPending} active=${c.hasActive} halted=${c.hasHalted} delisted=${c.hasDelisted}`;
}

/** L3 — parse status. */
export function parseMarketStatusCatalogStatusLine(line: string): {
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
export function marketStatusCatalogStatusLineMatches(): boolean {
  const p = parseMarketStatusCatalogStatusLine(marketStatusCatalogStatusLine());
  if (!p) return false;
  const c = marketStatusCatalogBoardCard();
  return (
    p.statuses === c.statuses &&
    p.pending === c.hasPending &&
    p.active === c.hasActive &&
    p.halted === c.hasHalted &&
    p.delisted === c.hasDelisted
  );
}

/** L3 — four statuses; halted present (kill/safety). */
export function marketStatusCatalogStatusLineConsistent(line: string): boolean {
  const p = parseMarketStatusCatalogStatusLine(line);
  if (!p) return false;
  return p.statuses === 4 && p.pending === 1 && p.active === 1 && p.halted === 1 && p.delisted === 1;
}

/** L3 — export header. */
export function marketStatusCatalogExportHeader(): string {
  return 'market_status';
}

/** L3 — export lines. */
export function marketStatusCatalogExportLines(): readonly string[] {
  return [...MARKET_STATUSES];
}

/** L3 — full export. */
export function marketStatusCatalogExportText(): string {
  return [marketStatusCatalogExportHeader(), ...marketStatusCatalogExportLines()].join('\n');
}

/** L3 — status declared. */
export function isDeclaredMarketStatus(s: string): boolean {
  return (MARKET_STATUSES as readonly string[]).includes(s);
}
