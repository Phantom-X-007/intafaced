/**
 * OTC RFQ desk errors (trade.otc / D-S-02 Part A).
 *
 * Codes are stable for wire mapping — never invent rates to avoid a refuse.
 */

export type OtcErrorCode =
  | 'trade.otc_desk_law_blank'
  | 'trade.otc_stake_gate'
  | 'trade.otc_stake_unavailable'
  | 'trade.otc_no_reference_price'
  | 'trade.otc_invalid_qty'
  | 'trade.otc_invalid_price'
  | 'trade.otc_bad_spread'
  | 'trade.otc_quote_expired'
  | 'trade.otc_last_look_forbidden'
  | 'trade.otc_not_owner'
  | 'trade.otc_quote_missing'
  | 'trade.otc_already_settled'
  | 'trade.otc_settle_refused';

export class OtcError extends Error {
  constructor(
    message: string,
    readonly code: OtcErrorCode,
    readonly residual?: string,
  ) {
    super(message);
    this.name = 'OtcError';
  }
}

/** Stable residual — DIRECTION §8 RFQ spreads / stake gate / principal choice. */
export const OTC_DESK_LAW_RESIDUAL =
  'DIRECTION §8 RFQ spreads, staked-tier threshold, and principal-vs-maker are owner-only — refuse-closed';
