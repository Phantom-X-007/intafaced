/**
 * Contracts L3 — pure analytics source DB catalog honesty (no warehouse I/O).
 *
 * Mirrors ops-analytics.ts ANALYTICS_SOURCE_DBS. Never invents live series.
 */

export const ANALYTICS_SOURCE_DBS = ['ledger', 'trade', 'identity'] as const;

/** L3 — catalog board. */
export function analyticsSourceCatalogBoardCard(): {
  readonly sources: number;
  readonly hasLedger: number;
  readonly hasTrade: number;
  readonly hasIdentity: number;
  readonly hasPay: number;
} {
  return {
    sources: ANALYTICS_SOURCE_DBS.length,
    hasLedger: ANALYTICS_SOURCE_DBS.includes('ledger') ? 1 : 0,
    hasTrade: ANALYTICS_SOURCE_DBS.includes('trade') ? 1 : 0,
    hasIdentity: ANALYTICS_SOURCE_DBS.includes('identity') ? 1 : 0,
    hasPay: 0,
  };
}

/** L3 — status line. */
export function analyticsSourceCatalogStatusLine(): string {
  const c = analyticsSourceCatalogBoardCard();
  return `sources=${c.sources} ledger=${c.hasLedger} trade=${c.hasTrade} identity=${c.hasIdentity} pay=${c.hasPay}`;
}

/** L3 — parse status. */
export function parseAnalyticsSourceCatalogStatusLine(line: string): {
  readonly sources: number;
  readonly ledger: number;
  readonly trade: number;
  readonly identity: number;
  readonly pay: number;
} | null {
  const m = line
    .trim()
    .match(/^sources=(\d+) ledger=([01]) trade=([01]) identity=([01]) pay=([01])$/);
  if (!m) return null;
  return {
    sources: Number(m[1]),
    ledger: Number(m[2]),
    trade: Number(m[3]),
    identity: Number(m[4]),
    pay: Number(m[5]),
  };
}

/** L3 — true when status matches. */
export function analyticsSourceCatalogStatusLineMatches(): boolean {
  const p = parseAnalyticsSourceCatalogStatusLine(analyticsSourceCatalogStatusLine());
  if (!p) return false;
  const c = analyticsSourceCatalogBoardCard();
  return (
    p.sources === c.sources &&
    p.ledger === c.hasLedger &&
    p.trade === c.hasTrade &&
    p.identity === c.hasIdentity &&
    p.pay === c.hasPay
  );
}

/** L3 — pay never a source DB; three sources. */
export function analyticsSourceCatalogStatusLineConsistent(line: string): boolean {
  const p = parseAnalyticsSourceCatalogStatusLine(line);
  if (!p) return false;
  return p.sources === 3 && p.pay === 0 && p.ledger === 1 && p.trade === 1 && p.identity === 1;
}

/** L3 — export header. */
export function analyticsSourceCatalogExportHeader(): string {
  return 'source';
}

/** L3 — export lines. */
export function analyticsSourceCatalogExportLines(): readonly string[] {
  return [...ANALYTICS_SOURCE_DBS];
}

/** L3 — full export. */
export function analyticsSourceCatalogExportText(): string {
  return [analyticsSourceCatalogExportHeader(), ...analyticsSourceCatalogExportLines()].join('\n');
}

/** L3 — source declared. */
export function isDeclaredAnalyticsSourceDb(db: string): boolean {
  return (ANALYTICS_SOURCE_DBS as readonly string[]).includes(db);
}
