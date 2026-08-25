/**
 * Trailing stop through matching. The stop walks with the mark.
 * Refuse if trail is missing. The engine does not invent a mark.
 */
import { ZERO, type Amount } from '@intafaced/ledger-client/money';
import type { OrderSide } from './types.js';

export const TRAIL_MISSING = 'missing_trail' as const;
export const MARK_MISSING = 'missing_mark' as const;

export type TrailingRefuse = typeof TRAIL_MISSING | typeof MARK_MISSING;

export function wantsTrailing(order: {
  readonly type?: string;
  readonly trail?: Amount | null;
}): boolean {
  return order.type === 'trailing_stop' || order.trail !== undefined;
}

/** Caller trail. Null/zero is missing — never invent a distance. */
export function readTrail(order: { readonly trail?: Amount | null }): Amount | null {
  if (order.trail !== undefined) return order.trail;
  return null;
}

/** Caller mark. Null/zero is missing — never invent a mark from last, mid, or best. */
export function readMark(order: { readonly mark?: Amount | null }): Amount | null {
  if (order.mark !== undefined) return order.mark;
  return null;
}

export function trailRefuse(
  trail: Amount | null,
): { readonly code: typeof TRAIL_MISSING; readonly message: string } | null {
  if (trail === null || trail <= ZERO) {
    return {
      code: TRAIL_MISSING,
      message: 'a trailing stop requires a trail; the engine does not invent a distance',
    };
  }
  return null;
}

export function markRefuse(
  mark: Amount | null,
): { readonly code: typeof MARK_MISSING; readonly message: string } | null {
  if (mark === null || mark <= ZERO) {
    return {
      code: MARK_MISSING,
      message: 'a trailing stop walks with the mark; the engine does not invent a mark',
    };
  }
  return null;
}

/**
 * Extreme the trail follows. Sell tracks the high; buy tracks the low.
 * A worse mark does not walk the stop back.
 */
export function ratchetPeak(side: OrderSide, peak: Amount | null, mark: Amount): Amount {
  if (peak === null) return mark;
  return side === 'sell' ? (mark > peak ? mark : peak) : mark < peak ? mark : peak;
}

/**
 * Trigger from the extreme and the trail. Sell is extreme minus trail.
 * Buy is extreme plus trail. Never invent a mark to fill either side.
 */
export function walkStop(side: OrderSide, extreme: Amount, trail: Amount): Amount | null {
  if (side === 'sell') {
    if (extreme <= trail) return null;
    return extreme - trail;
  }
  return extreme + trail;
}
