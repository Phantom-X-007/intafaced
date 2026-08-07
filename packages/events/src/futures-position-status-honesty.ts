/**
 * Events L3 — pure futures position-status catalog honesty (structural only).
 *
 * Mirrors catalog.ts position status: open | closed | liquidated.
 * Does not invent futures risk, marks, or liquidation policy.
 */

export const FUTURES_POSITION_STATUSES = ['open', 'closed', 'liquidated'] as const;
export type FuturesPositionStatusId = (typeof FUTURES_POSITION_STATUSES)[number];

/** L3 — catalog board. */
export function futuresPositionStatusCatalogBoardCard(): {
  readonly statuses: number;
  readonly hasOpen: number;
  readonly hasClosed: number;
  readonly hasLiquidated: number;
} {
  return {
    statuses: FUTURES_POSITION_STATUSES.length,
    hasOpen: FUTURES_POSITION_STATUSES.includes('open') ? 1 : 0,
    hasClosed: FUTURES_POSITION_STATUSES.includes('closed') ? 1 : 0,
    hasLiquidated: FUTURES_POSITION_STATUSES.includes('liquidated') ? 1 : 0,
  };
}

/** L3 — status line. */
export function futuresPositionStatusCatalogStatusLine(): string {
  const c = futuresPositionStatusCatalogBoardCard();
  return `statuses=${c.statuses} open=${c.hasOpen} closed=${c.hasClosed} liquidated=${c.hasLiquidated}`;
}

/** L3 — parse status. */
export function parseFuturesPositionStatusCatalogStatusLine(line: string): {
  readonly statuses: number;
  readonly open: number;
  readonly closed: number;
  readonly liquidated: number;
} | null {
  const m = line.trim().match(/^statuses=(\d+) open=([01]) closed=([01]) liquidated=([01])$/);
  if (!m) return null;
  return {
    statuses: Number(m[1]),
    open: Number(m[2]),
    closed: Number(m[3]),
    liquidated: Number(m[4]),
  };
}

/** L3 — true when status matches. */
export function futuresPositionStatusCatalogStatusLineMatches(): boolean {
  const p = parseFuturesPositionStatusCatalogStatusLine(futuresPositionStatusCatalogStatusLine());
  if (!p) return false;
  const c = futuresPositionStatusCatalogBoardCard();
  return p.statuses === c.statuses && p.open === c.hasOpen && p.closed === c.hasClosed && p.liquidated === c.hasLiquidated;
}

/** L3 — three statuses. */
export function futuresPositionStatusCatalogStatusLineConsistent(line: string): boolean {
  const p = parseFuturesPositionStatusCatalogStatusLine(line);
  if (!p) return false;
  return p.statuses === 3 && p.open === 1 && p.closed === 1 && p.liquidated === 1;
}

/** L3 — export header. */
export function futuresPositionStatusCatalogExportHeader(): string {
  return 'futures_position_status';
}

/** L3 — export lines. */
export function futuresPositionStatusCatalogExportLines(): readonly string[] {
  return [...FUTURES_POSITION_STATUSES];
}

/** L3 — full export. */
export function futuresPositionStatusCatalogExportText(): string {
  return [futuresPositionStatusCatalogExportHeader(), ...futuresPositionStatusCatalogExportLines()].join('\n');
}

/** L3 — status declared. */
export function isDeclaredFuturesPositionStatus(status: string): boolean {
  return (FUTURES_POSITION_STATUSES as readonly string[]).includes(status);
}
