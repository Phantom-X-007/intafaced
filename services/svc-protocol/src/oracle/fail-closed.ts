/**
 * Dual-source fail-closed mark (mirrors FailClosedOracle.sol).
 * Pure — no invent, no average through disagreement, no AMM.
 */
export type Report = { priceWad: bigint; updatedAt: number };

export class OracleRefuseError extends Error {
  constructor(
    message: string,
    readonly code: 'oracle.missing' | 'oracle.stale' | 'oracle.disagreement' | 'oracle.bad_price',
  ) {
    super(message);
    this.name = 'OracleRefuseError';
  }
}

export function markFromPair(
  a: Report | null,
  b: Report | null,
  now: number,
  stalenessBound: number,
  maxDisagreementBps: number,
): { priceWad: bigint; updatedAt: number } {
  if (!a || !b || a.updatedAt === 0 || b.updatedAt === 0) {
    throw new OracleRefuseError('missing report', 'oracle.missing');
  }
  if (a.priceWad <= 0n || b.priceWad <= 0n) {
    throw new OracleRefuseError('bad price', 'oracle.bad_price');
  }
  if (now - a.updatedAt > stalenessBound || now - b.updatedAt > stalenessBound) {
    throw new OracleRefuseError('stale', 'oracle.stale');
  }
  const lo = a.priceWad < b.priceWad ? a.priceWad : b.priceWad;
  const hi = a.priceWad < b.priceWad ? b.priceWad : a.priceWad;
  const diffBps = ((hi - lo) * 10_000n) / lo;
  if (diffBps > BigInt(maxDisagreementBps)) {
    throw new OracleRefuseError('disagreement', 'oracle.disagreement');
  }
  return { priceWad: lo, updatedAt: Math.min(a.updatedAt, b.updatedAt) };
}
