import { parseAmount } from '@intafaced/ledger-client';

export interface PerpListingProposal {
  /** Existing settlement asset id; an unset owner choice is not defaulted. */
  settle: string;
  /** Owner-approved oracle source identifier; never a price or ticker fixture. */
  oracleSource: string;
  /** Decimal-string maximum leverage from the listing owner. */
  leverageCap: string;
}

export type PerpListingRefuseCode =
  'market.settlement_asset_unset' | 'market.oracle_source_unset' | 'market.leverage_cap_unset' | 'market.leverage_cap_invalid';

export type PerpListingEligibility =
  | { orderable: true; code: null; missing: [] }
  | {
      orderable: false;
      code: PerpListingRefuseCode;
      missing: Array<'settle' | 'oracleSource' | 'leverageCap'>;
    };

function presentString(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Proposal-time gate shared by the future admin and shell surfaces. The first
 * missing owner decision wins so a UI can show one typed refusal at a time.
 * It neither creates a market nor guesses a settlement asset, oracle, or cap.
 */
export function assessPerpListing(proposal: PerpListingProposal): PerpListingEligibility {
  if (!presentString(proposal.settle)) {
    return { orderable: false, code: 'market.settlement_asset_unset', missing: ['settle'] };
  }
  if (!presentString(proposal.oracleSource)) {
    return { orderable: false, code: 'market.oracle_source_unset', missing: ['oracleSource'] };
  }
  if (typeof proposal.leverageCap !== 'string') {
    return { orderable: false, code: 'market.leverage_cap_invalid', missing: [] };
  }
  if (!proposal.leverageCap.trim()) {
    return { orderable: false, code: 'market.leverage_cap_unset', missing: ['leverageCap'] };
  }
  try {
    const cap = parseAmount(proposal.leverageCap);
    // Matches PostgreSQL numeric(38,18): the scaled bigint must fit in 38 digits.
    if (cap <= 0n || cap >= 10n ** 38n) throw new Error('outside numeric(38,18)');
  } catch {
    return { orderable: false, code: 'market.leverage_cap_invalid', missing: [] };
  }
  return { orderable: true, code: null, missing: [] };
}
