/**
 * Events L3 — pure p2p trade-resolver catalog honesty (structural only).
 *
 * Mirrors catalog.ts trade resolvedBy: buyer | seller | moderator | timeout.
 * Does not invent timeout clocks or dispute product law.
 */

export const P2P_TRADE_RESOLVERS = ['buyer', 'seller', 'moderator', 'timeout'] as const;
export type P2pTradeResolverId = (typeof P2P_TRADE_RESOLVERS)[number];

/** L3 — catalog board. */
export function p2pTradeResolverCatalogBoardCard(): {
  readonly resolvers: number;
  readonly hasBuyer: number;
  readonly hasSeller: number;
  readonly hasModerator: number;
  readonly hasTimeout: number;
} {
  return {
    resolvers: P2P_TRADE_RESOLVERS.length,
    hasBuyer: P2P_TRADE_RESOLVERS.includes('buyer') ? 1 : 0,
    hasSeller: P2P_TRADE_RESOLVERS.includes('seller') ? 1 : 0,
    hasModerator: P2P_TRADE_RESOLVERS.includes('moderator') ? 1 : 0,
    hasTimeout: P2P_TRADE_RESOLVERS.includes('timeout') ? 1 : 0,
  };
}

/** L3 — status line. */
export function p2pTradeResolverCatalogStatusLine(): string {
  const c = p2pTradeResolverCatalogBoardCard();
  return `resolvers=${c.resolvers} buyer=${c.hasBuyer} seller=${c.hasSeller} moderator=${c.hasModerator} timeout=${c.hasTimeout}`;
}

/** L3 — parse status. */
export function parseP2pTradeResolverCatalogStatusLine(line: string): {
  readonly resolvers: number;
  readonly buyer: number;
  readonly seller: number;
  readonly moderator: number;
  readonly timeout: number;
} | null {
  const m = line.trim().match(/^resolvers=(\d+) buyer=([01]) seller=([01]) moderator=([01]) timeout=([01])$/);
  if (!m) return null;
  return {
    resolvers: Number(m[1]),
    buyer: Number(m[2]),
    seller: Number(m[3]),
    moderator: Number(m[4]),
    timeout: Number(m[5]),
  };
}

/** L3 — true when status matches. */
export function p2pTradeResolverCatalogStatusLineMatches(): boolean {
  const p = parseP2pTradeResolverCatalogStatusLine(p2pTradeResolverCatalogStatusLine());
  if (!p) return false;
  const c = p2pTradeResolverCatalogBoardCard();
  return (
    p.resolvers === c.resolvers &&
    p.buyer === c.hasBuyer &&
    p.seller === c.hasSeller &&
    p.moderator === c.hasModerator &&
    p.timeout === c.hasTimeout
  );
}

/** L3 — four resolvers. */
export function p2pTradeResolverCatalogStatusLineConsistent(line: string): boolean {
  const p = parseP2pTradeResolverCatalogStatusLine(line);
  if (!p) return false;
  return p.resolvers === 4 && p.buyer === 1 && p.seller === 1 && p.moderator === 1 && p.timeout === 1;
}

/** L3 — export header. */
export function p2pTradeResolverCatalogExportHeader(): string {
  return 'p2p_trade_resolver';
}

/** L3 — export lines. */
export function p2pTradeResolverCatalogExportLines(): readonly string[] {
  return [...P2P_TRADE_RESOLVERS];
}

/** L3 — full export. */
export function p2pTradeResolverCatalogExportText(): string {
  return [p2pTradeResolverCatalogExportHeader(), ...p2pTradeResolverCatalogExportLines()].join('\n');
}

/** L3 — resolver declared. */
export function isDeclaredP2pTradeResolver(resolver: string): boolean {
  return (P2P_TRADE_RESOLVERS as readonly string[]).includes(resolver);
}
