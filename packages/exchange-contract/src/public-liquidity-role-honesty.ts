/**
 * Exchange-contract L3 — pure public liquidity-role catalog honesty (structural only).
 *
 * Mirrors tradeSchema.takerOrMaker: maker | taker.
 * Does not invent fee rates or money share.
 */

export const PUBLIC_LIQUIDITY_ROLES = ['maker', 'taker'] as const;
export type PublicLiquidityRoleId = (typeof PUBLIC_LIQUIDITY_ROLES)[number];

/** L3 — catalog board. */
export function publicLiquidityRoleCatalogBoardCard(): {
  readonly roles: number;
  readonly hasMaker: number;
  readonly hasTaker: number;
} {
  return {
    roles: PUBLIC_LIQUIDITY_ROLES.length,
    hasMaker: PUBLIC_LIQUIDITY_ROLES.includes('maker') ? 1 : 0,
    hasTaker: PUBLIC_LIQUIDITY_ROLES.includes('taker') ? 1 : 0,
  };
}

/** L3 — status line. */
export function publicLiquidityRoleCatalogStatusLine(): string {
  const c = publicLiquidityRoleCatalogBoardCard();
  return `roles=${c.roles} maker=${c.hasMaker} taker=${c.hasTaker}`;
}

/** L3 — parse status. */
export function parsePublicLiquidityRoleCatalogStatusLine(line: string): {
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
export function publicLiquidityRoleCatalogStatusLineMatches(): boolean {
  const p = parsePublicLiquidityRoleCatalogStatusLine(publicLiquidityRoleCatalogStatusLine());
  if (!p) return false;
  const c = publicLiquidityRoleCatalogBoardCard();
  return p.roles === c.roles && p.maker === c.hasMaker && p.taker === c.hasTaker;
}

/** L3 — two roles. */
export function publicLiquidityRoleCatalogStatusLineConsistent(line: string): boolean {
  const p = parsePublicLiquidityRoleCatalogStatusLine(line);
  if (!p) return false;
  return p.roles === 2 && p.maker === 1 && p.taker === 1;
}

/** L3 — export header. */
export function publicLiquidityRoleCatalogExportHeader(): string {
  return 'public_liquidity_role';
}

/** L3 — export lines. */
export function publicLiquidityRoleCatalogExportLines(): readonly string[] {
  return [...PUBLIC_LIQUIDITY_ROLES];
}

/** L3 — full export. */
export function publicLiquidityRoleCatalogExportText(): string {
  return [publicLiquidityRoleCatalogExportHeader(), ...publicLiquidityRoleCatalogExportLines()].join('\n');
}

/** L3 — role declared. */
export function isDeclaredPublicLiquidityRole(r: string): boolean {
  return (PUBLIC_LIQUIDITY_ROLES as readonly string[]).includes(r);
}
