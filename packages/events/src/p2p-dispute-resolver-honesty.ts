/**
 * Events L3 — pure p2p dispute-resolver catalog honesty (structural only).
 *
 * Mirrors catalog.ts dispute resolvedBy: seller | moderator.
 * Does not invent dispute product law or escrow recipes.
 */

export const P2P_DISPUTE_RESOLVERS = ['seller', 'moderator'] as const;
export type P2pDisputeResolverId = (typeof P2P_DISPUTE_RESOLVERS)[number];

/** L3 — catalog board. */
export function p2pDisputeResolverCatalogBoardCard(): {
  readonly resolvers: number;
  readonly hasSeller: number;
  readonly hasModerator: number;
} {
  return {
    resolvers: P2P_DISPUTE_RESOLVERS.length,
    hasSeller: P2P_DISPUTE_RESOLVERS.includes('seller') ? 1 : 0,
    hasModerator: P2P_DISPUTE_RESOLVERS.includes('moderator') ? 1 : 0,
  };
}

/** L3 — status line. */
export function p2pDisputeResolverCatalogStatusLine(): string {
  const c = p2pDisputeResolverCatalogBoardCard();
  return `resolvers=${c.resolvers} seller=${c.hasSeller} moderator=${c.hasModerator}`;
}

/** L3 — parse status. */
export function parseP2pDisputeResolverCatalogStatusLine(line: string): {
  readonly resolvers: number;
  readonly seller: number;
  readonly moderator: number;
} | null {
  const m = line.trim().match(/^resolvers=(\d+) seller=([01]) moderator=([01])$/);
  if (!m) return null;
  return { resolvers: Number(m[1]), seller: Number(m[2]), moderator: Number(m[3]) };
}

/** L3 — true when status matches. */
export function p2pDisputeResolverCatalogStatusLineMatches(): boolean {
  const p = parseP2pDisputeResolverCatalogStatusLine(p2pDisputeResolverCatalogStatusLine());
  if (!p) return false;
  const c = p2pDisputeResolverCatalogBoardCard();
  return p.resolvers === c.resolvers && p.seller === c.hasSeller && p.moderator === c.hasModerator;
}

/** L3 — two resolvers. */
export function p2pDisputeResolverCatalogStatusLineConsistent(line: string): boolean {
  const p = parseP2pDisputeResolverCatalogStatusLine(line);
  if (!p) return false;
  return p.resolvers === 2 && p.seller === 1 && p.moderator === 1;
}

/** L3 — export header. */
export function p2pDisputeResolverCatalogExportHeader(): string {
  return 'p2p_dispute_resolver';
}

/** L3 — export lines. */
export function p2pDisputeResolverCatalogExportLines(): readonly string[] {
  return [...P2P_DISPUTE_RESOLVERS];
}

/** L3 — full export. */
export function p2pDisputeResolverCatalogExportText(): string {
  return [p2pDisputeResolverCatalogExportHeader(), ...p2pDisputeResolverCatalogExportLines()].join('\n');
}

/** L3 — resolver declared. */
export function isDeclaredP2pDisputeResolver(resolver: string): boolean {
  return (P2P_DISPUTE_RESOLVERS as readonly string[]).includes(resolver);
}
