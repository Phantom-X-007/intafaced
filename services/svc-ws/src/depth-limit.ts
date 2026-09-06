/**
 * Owner-published L2 top-N window. Blank / non-integer / out of 1..500 refuses.
 * Never invent 50.
 */
import { parseAmount } from '@intafaced/ledger-client/money';
import type { DepthSnapshot, WireLevel } from '@intafaced/market-data';

export const WS_DEPTH_LIMIT_UNSET = 'ws.depth_limit_unset' as const;

export function isPublishedDepthLimit(limit: number | undefined): limit is number {
  return typeof limit === 'number' && Number.isInteger(limit) && limit >= 1 && limit <= 500;
}

/**
 * Top-N of a hub book. Bids descend, asks ascend. Caller already proved `limit`
 * is published — this does not invent 20/50.
 */
export function windowDepthSnapshot(snapshot: DepthSnapshot, limit: number): DepthSnapshot {
  return {
    ...snapshot,
    bids: topLevels(snapshot.bids, 'bids', limit),
    asks: topLevels(snapshot.asks, 'asks', limit),
  };
}

function topLevels(levels: readonly WireLevel[], side: 'bids' | 'asks', limit: number): WireLevel[] {
  const sorted = [...levels].sort((a, b) => {
    const pa = parseAmount(a[0]);
    const pb = parseAmount(b[0]);
    if (side === 'bids') return pb > pa ? 1 : pb < pa ? -1 : 0;
    return pa > pb ? 1 : pa < pb ? -1 : 0;
  });
  return sorted.slice(0, limit);
}
