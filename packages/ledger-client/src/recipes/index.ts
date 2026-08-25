import { mulBps, sub, type Amount } from '../money.js';
import type { AccountRef, EntryInput, PostRequest } from '../types.js';
import { InvalidEntryError } from '../types.js';
import {
  bankTransfer,
  earnDeposit,
  earnWithdraw,
  earnPoolFund,
  earnInterest,
  businessApprovalHold,
  businessApprovalRelease,
  businessApprovalSettle,
  businessPayroll,
} from './bank.js';
import { loanCollateralLock, loanCollateralRelease, loanDraw, loanRepay, loanLiquidate, loanBadDebt, loanReserveFund } from './loans.js';
import { chargebackOpen, chargebackShortfall, chargebackWon, chargebackShortfallRecovered } from './chargeback.js';
import { subAccountTransfer } from './sub-accounts.js';
import { marketListingFee, marketPremiumPlacement, marketPurchase } from './market.js';
import {
  assertEscrowDisputeRuling,
  assertEscrowRefundResolution,
  disputeRulingMeta,
  type EscrowDisputeRuling,
} from './escrow-dispute-law.js';
import {
  burnAccount,
  houseFees,
  merchantClearing,
  mintBoundary,
  orderHoldAccount,
  positionCollateralAccount,
  insuranceFund,
  railBoundary,
  marketMaker,
  marketMakerOrderHoldAccount,
  rewardsEngine,
  userAvailable,
  tradeEscrowAccount,
  tokenStakeAccount,
  withdrawalHoldAccount,
} from '../accounts.js';

export type { EscrowDisputeRuling } from './escrow-dispute-law.js';
export { NATURAL_PERSON_ID, isNaturalPersonId, assertEscrowDisputeRuling, assertEscrowRefundResolution } from './escrow-dispute-law.js';

/**
 * LEDGER RECIPES (§4.2).
 *
 * A recipe is a pure function: business intent in, a `PostRequest` out. It does
 * no I/O and holds no state, which means every money path in the OS can be
 * unit-tested without a database, and the same recipe produces byte-identical
 * entries in a test, in dev, and in production.
 *
 * Services call `ledger.post(recipes.tradeFill({...}))`. They never assemble
 * entries by hand — an inline entry list is a code-review rejection.
 */

const debit = (account: AccountRef, amount: Amount): EntryInput => ({ account, direction: 'debit', amount });
const credit = (account: AccountRef, amount: Amount): EntryInput => ({ account, direction: 'credit', amount });

function requirePositive(name: string, value: Amount): void {
  if (value <= 0n) throw new InvalidEntryError(`${name} must be positive`);
}

// ── Deposits & withdrawals ───────────────────────────────────────────────

export interface DepositInput {
  userId: string;
  assetId: string;
  amount: Amount;
  /** The rail the value arrived on — 'crypto-native', 'card-sandbox', … */
  rail: string;
  /** Rail's own reference (tx hash, PSP id) — this is what makes it idempotent. */
  railRef: string;
}

/** Value enters the book from the outside world. */
export function deposit(input: DepositInput): PostRequest {
  requirePositive('deposit amount', input.amount);
  return {
    idempotencyKey: `deposit:${input.rail}:${input.railRef}`,
    module: 'ledger',
    reason: 'deposit.credited',
    meta: { rail: input.rail, railRef: input.railRef },
    entries: [
      credit(railBoundary(input.rail, input.assetId), input.amount),
      debit(userAvailable(input.userId, input.assetId), input.amount),
    ],
  };
}
