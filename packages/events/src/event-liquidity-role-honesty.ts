/**
 * Events L3 — pure event-liquidity-role catalog honesty (structural only).
 *
 * Mirrors catalog.ts fill liquidity: maker | taker.
 * Does not invent fee schedules or matching law.
 */

export const EVENT_LIQUIDITY_ROLES = ['maker', 'taker'] as const;
export type EventLiquidityRoleId = (typeof EVENT_LIQUIDITY_ROLES)[number];

/** L3 — catalog board. */
export function eventLiquidityRoleCatalogBoardCard(): {
  readonly roles: number;
  readonly hasMaker: number;
  readonly hasTaker: number;
} {
  return {
    roles: EVENT_LIQUIDITY_ROLES.length,
    hasMaker: EVENT_LIQUIDITY_ROLES.includes('maker') ? 1 : 0,
    hasTaker: EVENT_LIQUIDITY_ROLES.includes('taker') ? 1 : 0,
  };
}

/** L3 — status line. */
export function eventLiquidityRoleCatalogStatusLine(): string {
  const c = eventLiquidityRoleCatalogBoardCard();
  return `roles=${c.roles} maker=${c.hasMaker} taker=${c.hasTaker}`;
}

/** L3 — parse status. */
export function parseEventLiquidityRoleCatalogStatusLine(line: string): {
  readonly roles: number;
  readonly maker: number;
  readonly taker: number;
} | null {
  const m = line.trim().match(/^roles=(\d+) maker=([01]) taker=([01])$/);
  if (!m) return null;
  return { roles: Number(m[1]), maker: Number(m[2]), taker: Number(m[3]) };
}

/** L3 — true when status matches. */
export function eventLiquidityRoleCatalogStatusLineMatches(): boolean {
  const p = parseEventLiquidityRoleCatalogStatusLine(eventLiquidityRoleCatalogStatusLine());
  if (!p) return false;
  const c = eventLiquidityRoleCatalogBoardCard();
  return p.roles === c.roles && p.maker === c.hasMaker && p.taker === c.hasTaker;
}

/** L3 — two roles. */
export function eventLiquidityRoleCatalogStatusLineConsistent(line: string): boolean {
  const p = parseEventLiquidityRoleCatalogStatusLine(line);
  if (!p) return false;
  return p.roles === 2 && p.maker === 1 && p.taker === 1;
}

/** L3 — export header. */
export function eventLiquidityRoleCatalogExportHeader(): string {
  return 'event_liquidity_role';
}

/** L3 — export lines. */
export function eventLiquidityRoleCatalogExportLines(): readonly string[] {
  return [...EVENT_LIQUIDITY_ROLES];
}

/** L3 — full export. */
export function eventLiquidityRoleCatalogExportText(): string {
  return [eventLiquidityRoleCatalogExportHeader(), ...eventLiquidityRoleCatalogExportLines()].join('\n');
}

/** L3 — role declared. */
export function isDeclaredEventLiquidityRole(role: string): boolean {
  return (EVENT_LIQUIDITY_ROLES as readonly string[]).includes(role);
}
