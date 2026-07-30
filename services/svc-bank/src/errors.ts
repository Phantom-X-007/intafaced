/**
 * svc-bank's own failure vocabulary.
 *
 * Codes are stable strings because they are what an SLO dashboard groups by and
 * what a client branches on. `bank.pool_underfunded` (an operator alarm: yield
 * we cannot pay) and `ledger.insufficient_funds` (a user with an empty space)
 * are both "the transfer did not happen", and collapsing them into one message
 * would make both unactionable.
 */
export type BankErrorCode =
  | 'bank.space_not_found'
  | 'bank.space_archived'
  | 'bank.space_locked'
  | 'bank.asset_mismatch'
  | 'bank.same_space'
  | 'bank.schedule_not_found'
  | 'bank.schedule_inactive'
  | 'bank.pool_not_found'
  | 'bank.pool_closed'
  | 'bank.pool_underfunded'
  | 'bank.below_minimum'
  | 'bank.native_asset_not_earnable'
  | 'bank.position_not_found'
  | 'bank.position_closed'
  | 'bank.position_locked'
  | 'bank.not_owner'
  // ── Loans (§8.1) ───────────────────────────────────────────────────────────
  | 'bank.loan_product_not_found'
  | 'bank.loan_product_closed'
  | 'bank.loan_not_found'
  | 'bank.loan_closed'
  /** Draw refused because the loan is not in `pending` — the ordering guard. */
  | 'bank.loan_not_drawable'
  /** The requested principal puts the loan over the product's opening LTV. */
  | 'bank.ltv_exceeded'
  /**
   * The lending reserve cannot fund this draw. An operator alarm, not a user
   * error, and deliberately distinct from `ledger.insufficient_funds`: one means
   * the borrower is short, the other means the platform is.
   */
  | 'bank.loan_reserve_underfunded'
  /** Collateral release refused while debt is outstanding. The important one. */
  | 'bank.loan_not_settled'
  /**
   * Liquidation refused because no margin call has been raised or its grace has
   * not expired. §8.1's ordering, as a refusal.
   */
  | 'bank.margin_call_required'
  /** A mark failed the staleness / deviation / quality guards in prices.ts. */
  | 'bank.mark_unusable'
  /** No mark at all for an asset the position holds. Never valued at zero. */
  | 'bank.mark_missing'
  /** A mark was zero or negative — a broken feed, not a cheap asset. */
  | 'bank.mark_invalid'
  /** Product thresholds are not ordered coherently. */
  | 'bank.policy_incoherent'
  /** Accrual has not run for so long that compounding the backlog needs a human. */
  | 'bank.accrual_backlog'
  /** Liquidation needs a funded counterparty and there is none. */
  | 'bank.no_liquidation_counterparty'
  /**
   * Collateral was exhausted without clearing the debt AND the insurance fund
   * could not cover it. The loudest code in this file.
   */
  | 'bank.bad_debt_uncovered';

export class BankError extends Error {
  constructor(
    message: string,
    readonly code: BankErrorCode,
  ) {
    super(message);
    this.name = 'BankError';
  }
}
