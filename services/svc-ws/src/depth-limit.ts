/**
 * Owner-published top-N window (L2 levels / native L3 price levels).
 * Blank / non-integer / out of 1..500 refuses. Never invent 20/50.
 */
import { parseAmount } from '@intafaced/ledger-client/money';
import type { DepthSnapshot, WireLevel } from '@intafaced/market-data';
import type { NativeL3Level, NativeL3Queue } from './depth/source.js';

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

/** Resting native L3: at least one order. Empty sides are absence, not a live zero queue. */
export function nativeL3HasRestingDepth(queue: NativeL3Queue): boolean {
  const has = (side: readonly NativeL3Level[]) => side.some((level) => level.orders.length > 0);
  return has(queue.bids) || has(queue.asks);
}

/**
 * Top-N native L3 price levels. Bids descend, asks ascend. Orders at a kept
 * price stay intact. Caller already proved `limit` is published — never 20/50.
 */
export function windowNativeL3Queue(queue: NativeL3Queue, limit: number): NativeL3Queue {
  return {
    ...queue,
    bids: topL3Levels(queue.bids, 'bids', limit),
    asks: topL3Levels(queue.asks, 'asks', limit),
  };
}

function topL3Levels(levels: readonly NativeL3Level[], side: 'bids' | 'asks', limit: number): NativeL3Level[] {
  const sorted = [...levels].sort((a, b) => {
    const pa = parseAmount(a.price);
    const pb = parseAmount(b.price);
    if (side === 'bids') return pb > pa ? 1 : pb < pa ? -1 : 0;
    return pa > pb ? 1 : pa < pb ? -1 : 0;
  });
  return sorted.slice(0, limit);
}
