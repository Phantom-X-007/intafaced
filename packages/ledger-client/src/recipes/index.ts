import { mulBps, sub, type Amount } from '../money.js';
import type { AccountRef, EntryInput, PostRequest } from '../types.js';
import { InvalidEntryError } from '../types.js';
import { bankTransfer, earnDeposit, earnWithdraw, earnPoolFund, earnInterest } from './bank.js';
import { loanCollateralLock, loanCollateralRelease, loanDraw, loanRepay, loanLiquidate, loanBadDebt, loanReserveFund } from './loans.js';
import {
  burnAccount,
  houseFees,
  merchantClearing,
  mintBoundary,
  orderHoldAccount,
  positionCollateralAccount,
  insuranceFund,
  railBoundary,
  rewardsEngine,
  userAvailable,
  tradeEscrowAccount,
  tokenStakeAccount,
  withdrawalHoldAccount,
} from '../accounts.js';

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

// ── Deposits & withdrawals ───────────────────────────────────────────────────

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

export interface WithdrawInput {
  userId: string;
  assetId: string;
  amount: Amount;
  rail: string;
  withdrawalId: string;
}

/** Step 1: funds leave `available` and sit in `hold` while the rail works. */
export function withdrawHold(input: WithdrawInput): PostRequest {
  requirePositive('withdrawal amount', input.amount);
  return {
    idempotencyKey: `withdraw.hold:${input.withdrawalId}`,
    module: 'ledger',
    reason: 'withdraw.held',
    meta: { rail: input.rail, withdrawalId: input.withdrawalId },
    entries: [
      credit(userAvailable(input.userId, input.assetId), input.amount),
      debit(withdrawalHoldAccount(input.userId, input.assetId, input.withdrawalId), input.amount),
    ],
  };
}

/** Step 2a: the rail confirmed. Value leaves the book. */
export function withdrawSettle(input: WithdrawInput): PostRequest {
  requirePositive('withdrawal amount', input.amount);
  return {
    idempotencyKey: `withdraw.settle:${input.withdrawalId}`,
    module: 'ledger',
    reason: 'withdraw.settled',
    meta: { rail: input.rail, withdrawalId: input.withdrawalId },
    // Draws on THIS withdrawal's hold. Before P0-3 this credited the user's one
    // shared hold account, so a settle could consume value an open order had
    // reserved — balanced books, unfunded order, no record of which.
    entries: [
      credit(withdrawalHoldAccount(input.userId, input.assetId, input.withdrawalId), input.amount),
      debit(railBoundary(input.rail, input.assetId), input.amount),
    ],
  };
}

/** Step 2b: the rail failed. The reversal path is defined, not improvised. */
export function withdrawReverse(input: WithdrawInput): PostRequest {
  requirePositive('withdrawal amount', input.amount);
  return {
    idempotencyKey: `withdraw.reverse:${input.withdrawalId}`,
    module: 'ledger',
    reason: 'withdraw.reversed',
    meta: { rail: input.rail, withdrawalId: input.withdrawalId },
    entries: [
      credit(withdrawalHoldAccount(input.userId, input.assetId, input.withdrawalId), input.amount),
      debit(userAvailable(input.userId, input.assetId), input.amount),
    ],
  };
}

// ── Trading ──────────────────────────────────────────────────────────────────

export interface TradeFillInput {
  fillId: string;
  makerId: string;
  takerId: string;
  /**
   * Which orders are being drawn down (P0-3).
   *
   * Required, because a fill has to say whose reservation it is spending. With
   * one hold per (user, asset) a fill could be settled out of a hold placed by
   * a completely different order — or by a withdrawal — and the transaction
   * would still balance.
   */
  makerOrderId: string;
  takerOrderId: string;
  baseAsset: string;
  quoteAsset: string;
  /** Base quantity traded. */
  qty: Amount;
  /** Total quote value of the fill (price × qty, already rounded by the engine). */
  quoteAmount: Amount;
  takerSide: 'buy' | 'sell';
  makerFeeBps: number;
  takerFeeBps: number;
}

/**
 * The six-entry atomic fill (§5.2).
 *
 * Each side's fee is taken from what that side receives, so a fill never
 * requires a party to hold a balance in an asset they were not trading.
 * Funds come out of `hold` — svc-trade placed them there when the order was
 * accepted, and the engine only ever matches orders that are already funded.
 */
export function tradeFill(input: TradeFillInput): PostRequest {
  requirePositive('fill qty', input.qty);
  requirePositive('fill quote amount', input.quoteAmount);

  const takerBuys = input.takerSide === 'buy';

  // Who pays which asset, and therefore whose hold is drawn down.
  const takerPaysAsset = takerBuys ? input.quoteAsset : input.baseAsset;
  const takerPaysAmount = takerBuys ? input.quoteAmount : input.qty;
  const makerPaysAsset = takerBuys ? input.baseAsset : input.quoteAsset;
  const makerPaysAmount = takerBuys ? input.qty : input.quoteAmount;

  // Each side receives what the other paid, minus its own fee.
  const takerFee = mulBps(makerPaysAmount, input.takerFeeBps);
  const makerFee = mulBps(takerPaysAmount, input.makerFeeBps);

  const takerReceives = sub(makerPaysAmount, takerFee);
  const makerReceives = sub(takerPaysAmount, makerFee);

  if (takerReceives < 0n || makerReceives < 0n) {
    throw new InvalidEntryError('Fee exceeds fill value — check fee bps configuration');
  }

  const entries: EntryInput[] = [
    // Asset the taker paid: out of THIS ORDER's hold, into maker available + house fees.
    credit(orderHoldAccount(input.takerId, takerPaysAsset, input.takerOrderId), takerPaysAmount),
    debit(userAvailable(input.makerId, takerPaysAsset), makerReceives),
    ...(makerFee > 0n ? [debit(houseFees('trade', takerPaysAsset), makerFee)] : []),

    // Asset the maker paid: out of THIS ORDER's hold, into taker available + house fees.
    credit(orderHoldAccount(input.makerId, makerPaysAsset, input.makerOrderId), makerPaysAmount),
    debit(userAvailable(input.takerId, makerPaysAsset), takerReceives),
    ...(takerFee > 0n ? [debit(houseFees('trade', makerPaysAsset), takerFee)] : []),
  ];

  return {
    idempotencyKey: `trade.fill:${input.fillId}`,
    module: 'trade',
    reason: 'trade.fill',
    meta: {
      fillId: input.fillId,
      takerSide: input.takerSide,
      makerFeeBps: input.makerFeeBps,
      takerFeeBps: input.takerFeeBps,
      makerOrderId: input.makerOrderId,
      takerOrderId: input.takerOrderId,
    },
    entries,
  };
}

export interface OrderHoldInput {
  orderId: string;
  userId: string;
  assetId: string;
  amount: Amount;
}

/** Funds reserved when an order is accepted. */
export function orderHold(input: OrderHoldInput): PostRequest {
  requirePositive('order hold amount', input.amount);
  return {
    idempotencyKey: `order.hold:${input.orderId}`,
    module: 'trade',
    reason: 'order.hold',
    meta: { orderId: input.orderId },
    entries: [
      credit(userAvailable(input.userId, input.assetId), input.amount),
      debit(orderHoldAccount(input.userId, input.assetId, input.orderId), input.amount),
    ],
  };
}

/** Unfilled remainder returned on cancel or expiry. */
export function orderHoldRelease(input: OrderHoldInput & { sequence?: number }): PostRequest {
  requirePositive('order release amount', input.amount);
  return {
    idempotencyKey: `order.release:${input.orderId}:${input.sequence ?? 0}`,
    module: 'trade',
    reason: 'order.hold.released',
    meta: { orderId: input.orderId },
    entries: [
      credit(orderHoldAccount(input.userId, input.assetId, input.orderId), input.amount),
      debit(userAvailable(input.userId, input.assetId), input.amount),
    ],
  };
}

// ── Futures margin (§5.2 / trade.futures) ────────────────────────────────────
//
// Pure recipes only — no mark price, no liquidation engine. svc-trade posts
// these when positions open/close/adjust. Insurance fund path is for realized
// losses that the user's margin cannot cover (engine decides amounts).

export interface FuturesMarginInput {
  positionId: string;
  userId: string;
  /** Margin asset (typically quote, e.g. USDT). */
  assetId: string;
  amount: Amount;
}

/** Lock margin into purpose-keyed collateral for one position. */
export function futuresMarginLock(input: FuturesMarginInput): PostRequest {
  requirePositive('futures margin lock amount', input.amount);
  return {
    idempotencyKey: `futures.margin.lock:${input.positionId}`,
    module: 'trade',
    reason: 'futures.margin.lock',
    meta: { positionId: input.positionId },
    entries: [
      credit(userAvailable(input.userId, input.assetId), input.amount),
      debit(positionCollateralAccount(input.userId, input.assetId, input.positionId), input.amount),
    ],
  };
}

/**
 * Add margin to an open position (same pot). Sequence in the key so repeated
 * top-ups do not collide with the open lock idempotency key.
 */
export function futuresMarginAdd(input: FuturesMarginInput & { sequence: number }): PostRequest {
  requirePositive('futures margin add amount', input.amount);
  if (input.sequence < 1) throw new InvalidEntryError('futures margin add sequence must be >= 1');
  return {
    idempotencyKey: `futures.margin.add:${input.positionId}:${input.sequence}`,
    module: 'trade',
    reason: 'futures.margin.add',
    meta: { positionId: input.positionId, sequence: input.sequence },
    entries: [
      credit(userAvailable(input.userId, input.assetId), input.amount),
      debit(positionCollateralAccount(input.userId, input.assetId, input.positionId), input.amount),
    ],
  };
}

/** Release remaining margin on close / cancel before open risk. */
export function futuresMarginRelease(input: FuturesMarginInput & { sequence?: number }): PostRequest {
  requirePositive('futures margin release amount', input.amount);
  return {
    idempotencyKey: `futures.margin.release:${input.positionId}:${input.sequence ?? 0}`,
    module: 'trade',
    reason: 'futures.margin.release',
    meta: { positionId: input.positionId },
    entries: [
      credit(positionCollateralAccount(input.userId, input.assetId, input.positionId), input.amount),
      debit(userAvailable(input.userId, input.assetId), input.amount),
    ],
  };
}

export interface FuturesLossInput {
  positionId: string;
  userId: string;
  assetId: string;
  /** Loss covered from the position's own margin. */
  fromMargin: Amount;
  /** Residual loss taken from insurance fund (may be 0n — then omit by not calling). */
  fromInsurance: Amount;
  /** Realized PnL sink: house trade fees pot until a dedicated PnL account exists. */
  lossId: string;
}

/**
 * Realize a loss against position margin (+ optional insurance).
 *
 * Entries balance per asset: margin (+ insurance) leave user/house pots into
 * house fees:trade as the temporary realized-loss sink (engine names the amounts).
 * Full insurance accounting may refine the sink later without changing the lock shape.
 */
export function futuresRealizeLoss(input: FuturesLossInput): PostRequest {
  if (input.fromMargin < 0n || input.fromInsurance < 0n) {
    throw new InvalidEntryError('futures loss legs must be non-negative');
  }
  const total = input.fromMargin + input.fromInsurance;
  requirePositive('futures realized loss total', total);

  const entries: EntryInput[] = [];
  if (input.fromMargin > 0n) {
    entries.push(credit(positionCollateralAccount(input.userId, input.assetId, input.positionId), input.fromMargin));
  }
  if (input.fromInsurance > 0n) {
    entries.push(credit(insuranceFund(input.assetId), input.fromInsurance));
  }
  entries.push(debit(houseFees('trade', input.assetId), total));

  return {
    idempotencyKey: `futures.loss:${input.lossId}`,
    module: 'trade',
    reason: 'futures.loss.realized',
    meta: {
      positionId: input.positionId,
      fromMargin: input.fromMargin.toString(),
      fromInsurance: input.fromInsurance.toString(),
    },
    entries,
  };
}

export interface FuturesProfitInput {
  positionId: string;
  userId: string;
  assetId: string;
  amount: Amount;
  /** Unique close/profit attempt key (idempotency). */
  profitId: string;
}

/**
 * Realize a profit on voluntary close (trade.futures residual).
 *
 * Symmetric counterpart of futuresRealizeLoss: house trade fees pot (temporary
 * PnL counterpart until a dedicated futures PnL account exists) pays the user's
 * available balance. Engine names the amount from an **external** exit mark —
 * this recipe never invents a price.
 */
export function futuresRealizeProfit(input: FuturesProfitInput): PostRequest {
  requirePositive('futures realized profit', input.amount);
  return {
    idempotencyKey: `futures.profit:${input.profitId}`,
    module: 'trade',
    reason: 'futures.profit.realized',
    meta: {
      positionId: input.positionId,
      amount: input.amount.toString(),
    },
    entries: [credit(houseFees('trade', input.assetId), input.amount), debit(userAvailable(input.userId, input.assetId), input.amount)],
  };
}

/**
 * Periodic funding payment between two positions (trade.futures F5 recipe).
 *
 * Engine chooses who pays whom and the amount from the funding rate × notional.
 * Value leaves the payer's position collateral and lands in the payee's
 * available balance (received funding is free cash, not forced re-margin).
 * Keyed on fundingId so an 8h period settles exactly once per pair.
 */
export interface FuturesFundingInput {
  /** Unique period key, e.g. `${marketId}:${periodStartIso}:${payerPositionId}`. */
  fundingId: string;
  payerUserId: string;
  payerPositionId: string;
  payeeUserId: string;
  payeePositionId: string;
  assetId: string;
  amount: Amount;
}

export function futuresFundingPay(input: FuturesFundingInput): PostRequest {
  requirePositive('futures funding amount', input.amount);
  return {
    idempotencyKey: `futures.funding:${input.fundingId}`,
    module: 'trade',
    reason: 'futures.funding.paid',
    meta: {
      fundingId: input.fundingId,
      payerPositionId: input.payerPositionId,
      payeePositionId: input.payeePositionId,
    },
    entries: [
      credit(positionCollateralAccount(input.payerUserId, input.assetId, input.payerPositionId), input.amount),
      debit(userAvailable(input.payeeUserId, input.assetId), input.amount),
    ],
  };
}

/**
 * Seed or top up the futures insurance fund from house trade fees.
 * Liquidation shortfalls draw via futuresRealizeLoss({ fromInsurance }).
 */
export function futuresInsuranceTopup(input: { topupId: string; assetId: string; amount: Amount }): PostRequest {
  requirePositive('insurance topup amount', input.amount);
  return {
    idempotencyKey: `futures.insurance.topup:${input.topupId}`,
    module: 'trade',
    reason: 'futures.insurance.topup',
    meta: { topupId: input.topupId },
    entries: [credit(houseFees('trade', input.assetId), input.amount), debit(insuranceFund(input.assetId), input.amount)],
  };
}

// ── P2P escrow (§6.2) ────────────────────────────────────────────────────────

export interface EscrowInput {
  tradeId: string;
  sellerId: string;
  buyerId: string;
  assetId: string;
  amount: Amount;
}

/** Seller's crypto moves into escrow the moment the taker accepts. */
export function escrowLock(input: EscrowInput): PostRequest {
  requirePositive('escrow amount', input.amount);
  return {
    idempotencyKey: `p2p.escrow.lock:${input.tradeId}`,
    module: 'p2p',
    reason: 'p2p.escrow.lock',
    meta: { tradeId: input.tradeId },
    entries: [
      credit(userAvailable(input.sellerId, input.assetId), input.amount),
      debit(tradeEscrowAccount(input.sellerId, input.assetId, input.tradeId), input.amount),
    ],
  };
}

/** Seller confirms fiat received — escrow releases to the buyer. */
export function escrowRelease(input: EscrowInput & { feeBps?: number }): PostRequest {
  requirePositive('escrow amount', input.amount);
  const fee = mulBps(input.amount, input.feeBps ?? 0);
  const toBuyer = sub(input.amount, fee);

  return {
    idempotencyKey: `p2p.escrow.release:${input.tradeId}`,
    module: 'p2p',
    reason: 'p2p.escrow.release',
    meta: { tradeId: input.tradeId, feeBps: input.feeBps ?? 0 },
    entries: [
      credit(tradeEscrowAccount(input.sellerId, input.assetId, input.tradeId), input.amount),
      debit(userAvailable(input.buyerId, input.assetId), toBuyer),
      ...(fee > 0n ? [debit(houseFees('p2p', input.assetId), fee)] : []),
    ],
  };
}

/** Cancelled or resolved in the seller's favour — escrow returns untouched. */
export function escrowRefund(input: EscrowInput & { resolution?: string }): PostRequest {
  requirePositive('escrow amount', input.amount);
  return {
    idempotencyKey: `p2p.escrow.refund:${input.tradeId}`,
    module: 'p2p',
    reason: 'p2p.escrow.refund',
    meta: { tradeId: input.tradeId, resolution: input.resolution ?? 'cancelled' },
    entries: [
      credit(tradeEscrowAccount(input.sellerId, input.assetId, input.tradeId), input.amount),
      debit(userAvailable(input.sellerId, input.assetId), input.amount),
    ],
  };
}

// ── Payments (§6.1) ──────────────────────────────────────────────────────────
//
// Three recipes cover the whole gateway money path, and they are deliberately
// staged rather than collapsed into one:
//
//   capture     rail → merchant clearing        (value enters the book)
//   settlement  clearing → merchant + house fee (the merchant can now spend it)
//   refund      clearing or merchant → rail     (value leaves the book)
//
// The clearing stop in the middle is what makes "captured but not settled"
// a balance you can read rather than an incident you have to reconstruct.

export interface PaymentCaptureInput {
  paymentId: string;
  merchantId: string;
  assetId: string;
  amount: Amount;
  /** The rail the value arrived on — 'crypto-native', 'card-sandbox', … */
  rail: string;
  /** The rail's own reference for the capture, for reconciliation against it. */
  railRef: string;
}

/**
 * A payment was captured at the rail. Value enters the book.
 *
 * Keyed on the payment, not on the rail reference: the business fact is "this
 * payment was captured", and it happens exactly once however many times a PSP
 * redelivers the webhook that announces it.
 */
export function paymentCapture(input: PaymentCaptureInput): PostRequest {
  requirePositive('capture amount', input.amount);
  return {
    idempotencyKey: `payment.capture:${input.paymentId}`,
    module: 'pay',
    reason: 'payment.captured',
    meta: { paymentId: input.paymentId, merchantId: input.merchantId, rail: input.rail, railRef: input.railRef },
    entries: [
      credit(railBoundary(input.rail, input.assetId), input.amount),
      debit(merchantClearing(input.merchantId, input.assetId), input.amount),
    ],
  };
}

export interface MerchantSettlementInput {
  merchantId: string;
  /** The merchant's own user account — the balance they trade and spend from. */
  merchantUserId: string;
  /** Settlement window label, e.g. '2026-07-27'. Part of the business key. */
  window: string;
  assetId: string;
  /** Captured, non-refunded value in the window. */
  gross: Amount;
  /** Platform fee for the window. May be zero. */
  fee: Amount;
}

/**
 * Settlement (§6.1): "merchant net posts to their ledger account — the same
 * balance graph they trade and spend from".
 *
 * The asset is part of the idempotency key as well as the merchant and window.
 * A merchant settling USDT and BTC for the same day is two settlements; without
 * the asset in the key the second would find the first's transaction, return it,
 * and silently strand a whole currency's takings in clearing.
 */
export function merchantSettlement(input: MerchantSettlementInput): PostRequest {
  requirePositive('settlement gross', input.gross);
  if (input.fee < 0n) throw new InvalidEntryError('Settlement fee cannot be negative');

  const net = sub(input.gross, input.fee);
  // A fee that swallows the entire settlement is a pricing bug, and posting it
  // would leave the merchant a zero-value transaction as their only record of
  // a window they actually earned in.
  requirePositive('settlement net', net);

  return {
    idempotencyKey: `settlement:${input.merchantId}:${input.window}:${input.assetId}`,
    module: 'pay',
    reason: 'pay.settled',
    meta: { merchantId: input.merchantId, window: input.window, assetId: input.assetId },
    entries: [
      credit(merchantClearing(input.merchantId, input.assetId), input.gross),
      debit(userAvailable(input.merchantUserId, input.assetId), net),
      ...(input.fee > 0n ? [debit(houseFees('pay', input.assetId), input.fee)] : []),
    ],
  };
}

export interface PaymentRefundInput {
  /** Business key for THIS refund — a payment may be refunded in parts. */
  refundId: string;
  paymentId: string;
  merchantId: string;
  merchantUserId: string;
  assetId: string;
  amount: Amount;
  rail: string;
  /**
   * Where the money comes back from.
   *
   * Before settlement the merchant has not been paid yet, so the value is still
   * in clearing. After settlement it is in their available balance and the
   * refund draws on it — which is exactly why a post-settlement refund can fail
   * with insufficient funds, and must be allowed to fail rather than be forced
   * through by taking the value from somewhere that is not the merchant's.
   */
  source: 'clearing' | 'settled';
}

/** Value leaves the book, back out through the rail it came in on. */
export function paymentRefund(input: PaymentRefundInput): PostRequest {
  requirePositive('refund amount', input.amount);

  const from =
    input.source === 'clearing' ? merchantClearing(input.merchantId, input.assetId) : userAvailable(input.merchantUserId, input.assetId);

  return {
    idempotencyKey: `payment.refund:${input.refundId}`,
    module: 'pay',
    reason: 'payment.refunded',
    meta: { paymentId: input.paymentId, refundId: input.refundId, source: input.source, rail: input.rail },
    entries: [credit(from, input.amount), debit(railBoundary(input.rail, input.assetId), input.amount)],
  };
}

/**
 * The refund did not go out after all — the rail refused it.
 *
 * Same shape as `withdrawReverse`: the reversal path on an outbound movement is
 * DEFINED, not improvised. svc-pay debits the merchant before asking the rail
 * to send anything, so a rail that says no leaves value sitting at the boundary
 * that belongs back with the merchant, and this puts it there.
 *
 * A separate transaction rather than an edit, because a ledger reverses; it
 * does not amend. Both postings stay in the journal and the trail reads
 * "we tried, it failed, we put it back".
 */
export function paymentRefundReverse(input: PaymentRefundInput): PostRequest {
  requirePositive('refund reversal amount', input.amount);

  const to =
    input.source === 'clearing' ? merchantClearing(input.merchantId, input.assetId) : userAvailable(input.merchantUserId, input.assetId);

  return {
    idempotencyKey: `payment.refund.reverse:${input.refundId}`,
    module: 'pay',
    reason: 'payment.refund.reversed',
    meta: { paymentId: input.paymentId, refundId: input.refundId, source: input.source, rail: input.rail },
    entries: [credit(railBoundary(input.rail, input.assetId), input.amount), debit(to, input.amount)],
  };
}

// ── Token: staking, emissions, burn (§4.3) ───────────────────────────────────

export interface StakeInput {
  stakeId: string;
  userId: string;
  assetId: string;
  amount: Amount;
  tier: 'flex' | 'm3' | 'm12';
}

export function stake(input: StakeInput): PostRequest {
  requirePositive('stake amount', input.amount);
  return {
    idempotencyKey: `token.stake:${input.stakeId}`,
    module: 'token',
    reason: 'token.stake',
    meta: { stakeId: input.stakeId, tier: input.tier },
    entries: [
      credit(userAvailable(input.userId, input.assetId), input.amount),
      debit(tokenStakeAccount(input.userId, input.assetId, input.stakeId), input.amount),
    ],
  };
}

export function unstake(input: StakeInput): PostRequest {
  requirePositive('unstake amount', input.amount);
  return {
    idempotencyKey: `token.unstake:${input.stakeId}`,
    module: 'token',
    reason: 'token.unstake',
    meta: { stakeId: input.stakeId, tier: input.tier },
    entries: [
      credit(tokenStakeAccount(input.userId, input.assetId, input.stakeId), input.amount),
      debit(userAvailable(input.userId, input.assetId), input.amount),
    ],
  };
}

export interface MintInput {
  epoch: number;
  assetId: string;
  amount: Amount;
  /** Where newly minted supply lands — a pool payout account or the rewards engine. */
  destination: AccountRef;
}

/** svc-token is the only minter (§4.3). New supply enters at the mint boundary. */
export function mintEmission(input: MintInput): PostRequest {
  requirePositive('emission amount', input.amount);
  return {
    idempotencyKey: `token.emission:${input.epoch}`,
    module: 'token',
    reason: 'token.emission',
    meta: { epoch: input.epoch },
    entries: [credit(mintBoundary(input.assetId), input.amount), debit(input.destination, input.amount)],
  };
}

export interface BurnInput {
  runId: string;
  assetId: string;
  amount: Amount;
  from: AccountRef;
}

/** Tokens debited to the burn account never move again. */
export function burn(input: BurnInput): PostRequest {
  requirePositive('burn amount', input.amount);
  return {
    idempotencyKey: `token.burn:${input.runId}`,
    module: 'token',
    reason: 'token.burn',
    meta: { runId: input.runId },
    entries: [credit(input.from, input.amount), debit(burnAccount(input.assetId), input.amount)],
  };
}

// ── Fees & rewards ───────────────────────────────────────────────────────────

export type FeeChargeInput = {
  chargeId: string;
  userId: string;
  module: string;
  reason?: string;
} & (
  | { mode: 'asset'; assetId: string; amount: Amount }
  | {
      /**
       * §4.3 fee-discount branch: the payer settles the fee in IFC and the
       * published decay schedule takes a cut off the gross. The caller supplies
       * the converted token amount — the recipe does not price anything.
       */
      mode: 'token';
      tokenAssetId: string;
      grossTokenAmount: Amount;
      discountBps: number;
    }
);

export function feeCharge(input: FeeChargeInput): PostRequest {
  if (input.mode === 'asset') {
    requirePositive('fee amount', input.amount);
    return {
      idempotencyKey: `fee:${input.module}:${input.chargeId}`,
      module: input.module,
      reason: input.reason ?? 'fee.charged',
      meta: { mode: 'asset' },
      entries: [
        credit(userAvailable(input.userId, input.assetId), input.amount),
        debit(houseFees(input.module, input.assetId), input.amount),
      ],
    };
  }

  requirePositive('fee amount', input.grossTokenAmount);
  if (input.discountBps < 0 || input.discountBps >= 10_000) {
    throw new InvalidEntryError(`Fee discount must be between 0 and 9999 bps, got ${input.discountBps}`);
  }

  // Discount rounds in the payer's favour: they never pay a rounding unit more
  // than the published schedule promises.
  const discount = mulBps(input.grossTokenAmount, input.discountBps, 'ceil');
  const net = sub(input.grossTokenAmount, discount);
  requirePositive('discounted fee amount', net);

  return {
    idempotencyKey: `fee:${input.module}:${input.chargeId}`,
    module: input.module,
    reason: input.reason ?? 'fee.charged',
    meta: { mode: 'token', discountBps: input.discountBps, gross: input.grossTokenAmount.toString() },
    entries: [credit(userAvailable(input.userId, input.tokenAssetId), net), debit(houseFees(input.module, input.tokenAssetId), net)],
  };
}

export interface RewardPayInput {
  rewardId: string;
  userId: string;
  assetId: string;
  amount: Amount;
  reason: string;
}

export interface FeeSweepInput {
  /** Identifies the revenue window being swept — the dedupe key. */
  windowId: string;
  /** Module whose fee account is being drained, e.g. 'trade'. */
  sourceModule: string;
  assetId: string;
  amount: Amount;
}

/**
 * Move accrued fees from a module's house account into the rewards engine, so
 * real-yield can be paid out of one pot (§4.3).
 *
 * This is what makes staking yield *real revenue* rather than emissions: the
 * value paid to stakers demonstrably came from fees the platform actually
 * earned, and the trail from `houseFees(module)` to a user's balance is two
 * ledger transactions, both queryable.
 */
export function sweepFeesToRewards(input: FeeSweepInput): PostRequest {
  requirePositive('fee sweep amount', input.amount);
  return {
    idempotencyKey: `token.fee.sweep:${input.windowId}:${input.sourceModule}:${input.assetId}`,
    module: 'token',
    reason: 'token.fee.swept',
    meta: { windowId: input.windowId, sourceModule: input.sourceModule },
    entries: [credit(houseFees(input.sourceModule, input.assetId), input.amount), debit(rewardsEngine(input.assetId), input.amount)],
  };
}

/** Real-yield distribution, cashback, tournament prizes — all from one pot. */
export function rewardPay(input: RewardPayInput): PostRequest {
  requirePositive('reward amount', input.amount);
  return {
    idempotencyKey: `reward:${input.rewardId}`,
    module: 'token',
    reason: input.reason,
    meta: { rewardId: input.rewardId },
    entries: [credit(rewardsEngine(input.assetId), input.amount), debit(userAvailable(input.userId, input.assetId), input.amount)],
  };
}

// ── Lending (§8.1) ───────────────────────────────────────────────────
//
// Moved to ./loans.ts, and REWRITTEN rather than relocated. Three stubs used to
// live here — `collateralLock`, `collateralRelease` and `liquidate`. Nothing in
// the monorepo called any of them, and a loan could not have been built on them:
// there was no way to release principal, no debt for a repayment to reduce, the
// whole of a seizure was booked as house revenue, and the liquidation key allowed
// exactly one liquidation per loan for all time. ./loans.ts sets out each one.

export * from './bank.js';
export * from './loans.js';

export const recipes = {
  deposit,
  withdrawHold,
  withdrawSettle,
  withdrawReverse,
  tradeFill,
  orderHold,
  orderHoldRelease,
  futuresMarginLock,
  futuresMarginAdd,
  futuresMarginRelease,
  futuresRealizeLoss,
  futuresRealizeProfit,
  futuresFundingPay,
  futuresInsuranceTopup,
  escrowLock,
  escrowRelease,
  escrowRefund,
  paymentCapture,
  merchantSettlement,
  paymentRefund,
  paymentRefundReverse,
  stake,
  unstake,
  mintEmission,
  burn,
  feeCharge,
  sweepFeesToRewards,
  rewardPay,
  // §8.1 loans — see ./loans.ts. Flagged shared-package change; replaces the
  // three unreachable collateral stubs that used to sit here.
  loanCollateralLock,
  loanCollateralRelease,
  loanDraw,
  loanRepay,
  loanLiquidate,
  loanBadDebt,
  loanReserveFund,
  // §8.1 svc-bank — see ./bank.ts. Flagged shared-package change.
  bankTransfer,
  earnDeposit,
  earnWithdraw,
  earnPoolFund,
  earnInterest,
} as const;

export type RecipeName = keyof typeof recipes;
