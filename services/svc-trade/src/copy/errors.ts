/**
 * Copy trading errors (trade.copy / D-S-03 / SPEC-SOVEREIGN-ROUTING-AND-COPY).
 *
 * Codes are stable for wire mapping — never invent leader_share_bps or
 * jurisdiction lists to avoid a refuse.
 */

export type CopyErrorCode =
  | 'trade.copy_fee_share_blank'
  | 'trade.copy_jurisdiction_blank'
  | 'trade.copy_law_blank'
  | 'trade.copy_jurisdiction_blocked'
  | 'trade.copy_self_follow'
  | 'trade.copy_already_following'
  | 'trade.copy_not_following'
  | 'trade.copy_envelope_invalid'
  | 'trade.copy_cap_exceeded'
  | 'trade.copy_market_not_permitted'
  | 'trade.copy_key_expired'
  | 'trade.copy_fee_share_killed'
  | 'trade.copy_pnl_fee_forbidden'
  | 'trade.copy_ranking_forbidden'
  | 'trade.copy_settle_refused';

export class CopyError extends Error {
  constructor(
    message: string,
    readonly code: CopyErrorCode,
    readonly residual?: string,
  ) {
    super(message);
    this.name = 'CopyError';
  }
}

/** Stable residual — DIRECTION §8 leader_share_bps + served jurisdiction list. */
export const COPY_FEE_SHARE_RESIDUAL = 'DIRECTION §8 leader_share_bps is owner-only — refuse-closed (never invent fee-share rates)';

export const COPY_JURISDICTION_RESIDUAL =
  'DIRECTION §8 served-jurisdiction list is owner-only — refuse-closed (never invent geo allowlist)';

export const COPY_LAW_RESIDUAL = 'DIRECTION §8 leader_share_bps and jurisdiction list are owner-only — refuse-closed';
