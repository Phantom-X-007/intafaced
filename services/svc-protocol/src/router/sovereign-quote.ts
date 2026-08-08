/**
 * Sovereign router quote pick (S-A5) — book vs pool without inventing prices.
 * Book quote MUST be supplied by the caller from a real book; null means pool-only.
 */
import { getAmountOut, AmmMathError } from '../amm/math.js';

export type RouteChoice =
  | { path: 'pool'; amountOut: bigint; reason: 'pool_only' | 'pool_better' }
  | { path: 'book'; amountOut: bigint; reason: 'book_better' }
  | { path: 'refuse'; reason: 'no_liquidity' | 'no_quotes' };

export function pickBestRoute(input: {
  amountIn: bigint;
  reserveIn: bigint;
  reserveOut: bigint;
  feeBps: number;
  /** Caller-supplied book out for the same size; never invented here. */
  bookAmountOut: bigint | null;
}): RouteChoice {
  let poolOut: bigint | null = null;
  try {
    poolOut = getAmountOut(input.amountIn, input.reserveIn, input.reserveOut, input.feeBps);
  } catch (e) {
    if (!(e instanceof AmmMathError)) throw e;
  }

  const book = input.bookAmountOut;
  if (poolOut === null && (book === null || book <= 0n)) {
    return { path: 'refuse', reason: book === null ? 'no_quotes' : 'no_liquidity' };
  }
  if (poolOut === null) {
    return { path: 'book', amountOut: book!, reason: 'book_better' };
  }
  if (book === null || book <= 0n) {
    return { path: 'pool', amountOut: poolOut, reason: 'pool_only' };
  }
  if (book > poolOut) return { path: 'book', amountOut: book, reason: 'book_better' };
  return { path: 'pool', amountOut: poolOut, reason: 'pool_better' };
}
