/**
 * Trade L3 — pure liquidity-role catalog honesty (structural only).
 *
 * Mirrors types.ts Liquidity: maker | taker.
 * Does not invent fee rates or money share.
 */

export const LIQUIDITY_ROLES = ['maker', 'taker'] as const;
export type LiquidityRoleId = (typeof LIQUIDITY_ROLES)[number];

/** L3 — catalog board. */
export function liquidityRoleCatalogBoardCard(): {
  readonly roles: number;
  readonly hasMaker: number;
  readonly hasTaker: number;
} {
  return {
    roles: LIQUIDITY_ROLES.length,
    hasMaker: LIQUIDITY_ROLES.includes('maker') ? 1 : 0,
    hasTaker: LIQUIDITY_ROLES.includes('taker') ? 1 : 0,
  };
}

/** L3 — status line. */
export function liquidityRoleCatalogStatusLine(): string {
  const c = liquidityRoleCatalogBoardCard();
  return `roles=${c.roles} maker=${c.hasMaker} taker=${c.hasTaker}`;
}

/** L3 — parse status. */
export function parseLiquidityRoleCatalogStatusLine(line: string): {
  readonly roles: number;
  readonly maker: number;
  readonly taker: number;
} | null {
  const m = line.trim().match(/^roles=(\d+) maker=([01]) taker=([01])$/);
  if (!m) return null;
  return {
    roles: Number(m[1]),
    maker: Number(m[2]),
    taker: Number(m[3]),
  };
}

/** L3 — true when status matches. */
export function liquidityRoleCatalogStatusLineMatches(): boolean {
  const p = parseLiquidityRoleCatalogStatusLine(liquidityRoleCatalogStatusLine());
  if (!p) return false;
  const c = liquidityRoleCatalogBoardCard();
  return p.roles === c.roles && p.maker === c.hasMaker && p.taker === c.hasTaker;
}

/** L3 — two roles. */
export function liquidityRoleCatalogStatusLineConsistent(line: string): boolean {
  const p = parseLiquidityRoleCatalogStatusLine(line);
  if (!p) return false;
  return p.roles === 2 && p.maker === 1 && p.taker === 1;
}

/** L3 — export header. */
export function liquidityRoleCatalogExportHeader(): string {
  return 'liquidity_role';
}

/** L3 — export lines. */
export function liquidityRoleCatalogExportLines(): readonly string[] {
  return [...LIQUIDITY_ROLES];
}

/** L3 — full export. */
export function liquidityRoleCatalogExportText(): string {
  return [liquidityRoleCatalogExportHeader(), ...liquidityRoleCatalogExportLines()].join('\n');
}

/** L3 — role declared. */
export function isDeclaredLiquidityRole(role: string): boolean {
  return (LIQUIDITY_ROLES as readonly string[]).includes(role);
}
