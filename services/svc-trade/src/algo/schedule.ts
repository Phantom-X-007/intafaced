import type { Amount } from '@intafaced/ledger-client';
import { TradeError } from '../spot/types.js';

/**
 * TWAP slice plan — pure schedule math. No I/O, no fills, no prices.
 *
 * Splits `totalQty` into N equal slices (last absorbs remainder) where
 * N = floor(durationMs / sliceIntervalMs), at least 1. Each slice is snapped
 * down to `lotSize` so child orders pass `assertQty`; remainder that cannot
 * form a full lot is dropped from the schedule (honest shortfall, not invent).
 */

export interface TwapSlicePlan {
  readonly slices: readonly Amount[];
  readonly plannedQty: Amount;
  /** Portion of totalQty that could not form a lot-aligned slice. */
  readonly droppedQty: Amount;
}

export function planTwapSlices(input: { totalQty: Amount; durationMs: number; sliceIntervalMs: number; lotSize: Amount }): TwapSlicePlan {
  if (input.totalQty <= 0n) {
    throw new TradeError('TWAP total quantity must be strictly positive', 'trade.algo_invalid_qty');
  }
  if (!Number.isFinite(input.durationMs) || input.durationMs <= 0) {
    throw new TradeError('TWAP durationMs must be > 0', 'trade.algo_invalid_schedule');
  }
  if (!Number.isFinite(input.sliceIntervalMs) || input.sliceIntervalMs <= 0) {
    throw new TradeError('TWAP sliceIntervalMs must be > 0', 'trade.algo_invalid_schedule');
  }
  if (input.sliceIntervalMs > input.durationMs) {
    throw new TradeError('TWAP sliceIntervalMs must not exceed durationMs', 'trade.algo_invalid_schedule');
  }
  if (input.lotSize <= 0n) {
    throw new TradeError('lot size must be positive', 'trade.algo_invalid_qty');
  }

  const n = Math.max(1, Math.floor(input.durationMs / input.sliceIntervalMs));
  const base = input.totalQty / BigInt(n);
  const rem = input.totalQty % BigInt(n);

  const raw: Amount[] = [];
  for (let i = 0; i < n; i++) {
    raw.push(i === n - 1 ? base + rem : base);
  }

  const slices: Amount[] = [];
  let planned = 0n;
  for (const q of raw) {
    const snapped = q - (q % input.lotSize);
    if (snapped > 0n) {
      slices.push(snapped);
      planned += snapped;
    }
  }

  if (slices.length === 0) {
    throw new TradeError(`TWAP total ${input.totalQty} is below one lot (${input.lotSize}) after schedule split`, 'trade.algo_invalid_qty');
  }

  return { slices, plannedQty: planned, droppedQty: input.totalQty - planned };
}
