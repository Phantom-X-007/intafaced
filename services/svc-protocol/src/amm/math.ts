/**
 * Constant-product AMM quote math (Uniswap V2-class).
 *
 * Pure. No chain I/O. Mirrors `ConstantProductPool._getAmountOut` so the
 * TypeScript RFQ the user sees matches what the contract will pay — the same
 * discipline as trade.convert vs the book.
 *
 * Amounts are unscaled uint256-style bigints (wei), not ledger Amount SCALE.
 * Protocol Plane does not post to the ledger.
 */

export const FEE_DENOM = 10_000n;

export class AmmMathError extends Error {
  constructor(
    message: string,
    readonly code: 'amm.zero_input' | 'amm.no_liquidity' | 'amm.bad_fee' | 'amm.insufficient_out',
  ) {
    super(message);
    this.name = 'AmmMathError';
  }
}

/** Exact-in → out with fee on input, floored. */
export function getAmountOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint, feeBps: number): bigint {
  if (amountIn <= 0n) throw new AmmMathError('amountIn must be positive', 'amm.zero_input');
  if (reserveIn <= 0n || reserveOut <= 0n) throw new AmmMathError('empty reserves', 'amm.no_liquidity');
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 1000) {
    throw new AmmMathError('feeBps out of range', 'amm.bad_fee');
  }

  const amountInWithFee = amountIn * (FEE_DENOM - BigInt(feeBps));
  const numerator = amountInWithFee * reserveOut;
  const denominator = reserveIn * FEE_DENOM + amountInWithFee;
  return numerator / denominator;
}

/** Exact-out → required in (ceil), for limit-style quotes. */
export function getAmountIn(amountOut: bigint, reserveIn: bigint, reserveOut: bigint, feeBps: number): bigint {
  if (amountOut <= 0n) throw new AmmMathError('amountOut must be positive', 'amm.zero_input');
  if (reserveIn <= 0n || reserveOut <= 0n) throw new AmmMathError('empty reserves', 'amm.no_liquidity');
  if (amountOut >= reserveOut) throw new AmmMathError('insufficient liquidity for amountOut', 'amm.no_liquidity');
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 1000) {
    throw new AmmMathError('feeBps out of range', 'amm.bad_fee');
  }

  const numerator = reserveIn * amountOut * FEE_DENOM;
  const denominator = (reserveOut - amountOut) * (FEE_DENOM - BigInt(feeBps));
  return numerator / denominator + 1n; // ceil
}

/** Spot price of tokenOut per tokenIn, as a rational (num/den) in wei terms. */
export function spotPrice(reserveIn: bigint, reserveOut: bigint): { num: bigint; den: bigint } {
  if (reserveIn <= 0n || reserveOut <= 0n) throw new AmmMathError('empty reserves', 'amm.no_liquidity');
  return { num: reserveOut, den: reserveIn };
}

/**
 * Price impact bps of a swap vs spot (approximate): how much worse than mid.
 * Returns integer bps the user "pays" as impact (not including the fee line).
 */
export function priceImpactBps(amountIn: bigint, reserveIn: bigint, reserveOut: bigint, feeBps: number): number {
  const out = getAmountOut(amountIn, reserveIn, reserveOut, feeBps);
  // effective price = amountIn/out ; spot = reserveIn/reserveOut
  // impact ≈ 1 - (out/amountIn) / (reserveOut/reserveIn) = 1 - out*reserveIn / (amountIn*reserveOut)
  const spotOut = (amountIn * reserveOut) / reserveIn;
  if (spotOut === 0n) return 0;
  if (out >= spotOut) return 0;
  const lost = spotOut - out;
  return Number((lost * 10_000n) / spotOut);
}
