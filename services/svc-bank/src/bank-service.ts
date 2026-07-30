import type { Sql } from 'postgres';
import type { LedgerClient } from '@intafaced/ledger-client';
import { SpaceService } from './spaces/space-service.js';
import { TransferService } from './transfers/transfer-service.js';
import { EarnService } from './earn/earn-service.js';
import { SpendAnalytics } from './analytics/spend.js';
import { LoanService, type LoanServiceOptions } from './loans/loan-service.js';
import { fixedPriceSource } from './loans/prices.js';
import type { LedgerHistory } from './analytics/ledger-history.js';

/**
 * svc-bank — MULTI-CURRENCY ACCOUNTS OVER THE LEDGER (§8.1).
 *
 * This service is a PROJECTION, not a source of truth. It stores names,
 * policies, instructions and records of completed jobs. It stores no balance,
 * anywhere, and the three services below are wired so that it cannot start:
 * every "how much" question they answer goes to `LedgerClient`, and nothing in
 * this service writes a figure that a later read could mistake for one.
 *
 * The composition root is one function so the wiring is visible in one place —
 * including that `SpendAnalytics` gets a READ port over the ledger and no
 * writer at all.
 */

export interface BankServices {
  readonly spaces: SpaceService;
  readonly transfers: TransferService;
  readonly earn: EarnService;
  readonly analytics: SpendAnalytics;
  readonly loans: LoanService;
}

export interface BankServiceOptions {
  /** Refused by earn pools — svc-token owns native staking (§8.1). */
  nativeAssetId?: string;
  /**
   * Loan wiring: where LTV marks come from, who buys seized collateral, and where
   * a margin call is delivered.
   *
   * Injected rather than constructed here, and deliberately not defaulted to a
   * live feed. svc-trade has no index price today — only best bid/ask and last
   * trade — so the adapter in use decides whether a liquidation may happen at
   * all. `loans/prices.ts` sets out what that costs and what would fix it. A
   * default that quietly reached for `last` would bury the most important caveat
   * in this module inside a composition root nobody reads.
   */
  loans?: LoanServiceOptions;
}

export function createBankServices(sql: Sql, ledger: LedgerClient, history: LedgerHistory, options: BankServiceOptions = {}): BankServices {
  const spaces = new SpaceService(sql, ledger);
  const transfers = new TransferService(sql, ledger, spaces);
  const earn = new EarnService(sql, ledger, { nativeAssetId: options.nativeAssetId ?? 'IFC' });
  const analytics = new SpendAnalytics(spaces, history);
  // No price source configured = no marks = no liquidations, and every LTV read
  // fails with `bank.mark_missing`. The correct posture for a deployment that has
  // not decided where its prices come from.
  const loans = new LoanService(sql, ledger, options.loans ?? { priceSource: fixedPriceSource({}) });

  return { spaces, transfers, earn, analytics, loans };
}

export { SpaceService, TransferService, EarnService, SpendAnalytics, LoanService };
export { BankError, type BankErrorCode } from './errors.js';
export { accountForSpace, type SpaceRecord, type SpaceView } from './spaces/space-service.js';
export { planDue, occurrenceStart, dueOccurrence, type Cadence } from './transfers/schedule.js';
export { dailyInterest, planAccrual, accrualDate } from './earn/interest.js';
export {
  DEFAULT_LIQUIDATION_POLICY,
  RiskError,
  accrualDay,
  assertPolicyCoherent,
  dailyLoanInterest,
  daysToAccrue,
  describeLtv,
  ltvBps,
  markPortfolio,
  planLiquidation,
  splitProceeds,
  type LiquidationPolicy,
  type Mark,
  type PortfolioMark,
} from './loans/risk.js';
export {
  DEFAULT_MARK_POLICY,
  acceptableForLiquidation,
  acceptableForMarking,
  fixedPriceSource,
  tickerPriceSource,
  type MarkPolicy,
  type MarkQuality,
  type PriceSource,
  type QuotedMark,
} from './loans/prices.js';
export {
  marketMakerVenue,
  recordOnlyMarginCallSink,
  type LiquidationVenue,
  type LoanDebt,
  type LoanProductRecord,
  type LoanRecord,
  type LoanServiceOptions,
  type MarginCallSink,
} from './loans/loan-service.js';
export { categorise, SPEND_CATEGORIES, type SpendCategory, type SpendSummary } from './analytics/spend.js';
export { memoryLedgerHistory, type LedgerHistory, type LedgerEntryRecord } from './analytics/ledger-history.js';
