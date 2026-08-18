import { parseAmount, type Amount } from '@intafaced/ledger-client/money';

/**
 * S-I3 — CLOB taker fee + quote-asset settlement cost.
 *
 * A missing schedule must not become `0` / `'0'`. Those defaults understate the
 * user's cost and make every quote look better than the fill. Either both knobs
 * are set (operator copied them from the venue — SovereignVenue.takerFeeBps /
 * settlementCostQuote) or the CLOB venue is not quoted at all.
 */
export interface ClobCosts {
  readonly feeBps: number;
  readonly settlementCost: Amount;
}

export class ClobFeeUnconfiguredError extends Error {
  readonly code = 'dex.clob_fee_unconfigured';
  constructor() {
    super(
      'dex.clob_fee_unconfigured — DEX_CLOB_FEE_BPS and DEX_CLOB_SETTLEMENT_COST must be set together (from the venue), or omitted together. A lone default 0 understates cost.',
    );
    this.name = 'ClobFeeUnconfiguredError';
  }
}

export function clobCostsFromOptional(feeBps: number | undefined, settlementCost: string | undefined): ClobCosts | null {
  const feeSet = feeBps !== undefined;
  const costSet = settlementCost !== undefined && settlementCost !== '';
  if (!feeSet && !costSet) return null;
  if (!feeSet || !costSet) throw new ClobFeeUnconfiguredError();
  return { feeBps, settlementCost: parseAmount(settlementCost) };
}
