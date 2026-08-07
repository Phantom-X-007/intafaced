/**
 * Copy fee-share attribution + ledger plan (D-S-03 §3 / §7.4–§7.5).
 *
 * Share of protocol trading fee only — never follower P&L.
 * Blank DIRECTION §8 leader_share_bps → refuse before any PostRequest.
 * When published: house fee → rewards pot → leader via ledger-client recipes.
 */

import { formatAmount, mulBps, parseAmount, recipes, type Amount, type LedgerClient, type PostRequest } from '@intafaced/ledger-client';
import { COPY_FEE_SHARE_RESIDUAL, CopyError } from './errors.js';
import { requirePublishedCopyFeeShareLaw, type CopyFeeShareLaw } from './fee-share-law.js';

export interface FeeShareAttributionInput {
  readonly law: CopyFeeShareLaw;
  readonly fillId: string;
  readonly leaderId: string;
  readonly followerId: string;
  readonly assetId: string;
  /** Follower fill notional (quote asset). */
  readonly followerFillNotional: Amount;
  /** Protocol maker/taker fee bps already charged on the fill (existing surface). */
  readonly protocolFeeBps: number;
  /** Round-trips already attributed this period for churn decay. */
  readonly roundTripsThisPeriod: number;
  /** Leader earnings already paid for this follower this period. */
  readonly earningsPaidThisPeriod: Amount;
  /** When true, kill switch — refuse payout. */
  readonly feeShareKilled: boolean;
}

export interface FeeShareAttribution {
  readonly fillId: string;
  readonly leaderId: string;
  readonly followerId: string;
  readonly assetId: string;
  readonly protocolFee: Amount;
  readonly appliedShareBps: number;
  readonly grossLeaderShare: Amount;
  readonly cappedLeaderShare: Amount;
  readonly skippedReason: null | 'cap_reached' | 'zero_share';
}

export interface FeeShareSettlePlan {
  readonly attribution: FeeShareAttribution;
  /** Sweep house trade fees into rewards pot (real revenue path). */
  readonly sweep: PostRequest;
  /** Pay leader from rewards pot. */
  readonly payout: PostRequest;
}

/**
 * Compute leader fee-share for one follower fill.
 * Never references P&L. Blank law → refuse.
 */
export function attributeCopyFeeShare(input: FeeShareAttributionInput): FeeShareAttribution {
  const law = requirePublishedCopyFeeShareLaw(input.law);

  if (input.feeShareKilled) {
    throw new CopyError('Fee-share killed for this leader/follow — refuse payout', 'trade.copy_fee_share_killed');
  }

  if (!Number.isInteger(input.protocolFeeBps) || input.protocolFeeBps < 0 || input.protocolFeeBps > 10_000) {
    throw new CopyError('protocolFeeBps must be an integer 0..10000', 'trade.copy_settle_refused', COPY_FEE_SHARE_RESIDUAL);
  }
  if (input.followerFillNotional <= 0n) {
    throw new CopyError('Follower fill notional must be strictly positive', 'trade.copy_settle_refused');
  }

  const protocolFee = mulBps(input.followerFillNotional, input.protocolFeeBps, 'floor');
  const appliedShareBps =
    law.decayRoundTrips > 0 && input.roundTripsThisPeriod >= law.decayRoundTrips ? law.decayShareBps : law.leaderShareBps;

  const grossLeaderShare = mulBps(protocolFee, appliedShareBps, 'floor');
  const cap = parseAmount(law.earningsCapPerFollower);
  const remaining = cap > input.earningsPaidThisPeriod ? cap - input.earningsPaidThisPeriod : 0n;

  if (remaining <= 0n) {
    return {
      fillId: input.fillId,
      leaderId: input.leaderId,
      followerId: input.followerId,
      assetId: input.assetId,
      protocolFee,
      appliedShareBps,
      grossLeaderShare,
      cappedLeaderShare: 0n,
      skippedReason: 'cap_reached',
    };
  }

  const cappedLeaderShare = grossLeaderShare <= remaining ? grossLeaderShare : remaining;
  if (cappedLeaderShare <= 0n) {
    return {
      fillId: input.fillId,
      leaderId: input.leaderId,
      followerId: input.followerId,
      assetId: input.assetId,
      protocolFee,
      appliedShareBps,
      grossLeaderShare,
      cappedLeaderShare: 0n,
      skippedReason: 'zero_share',
    };
  }

  return {
    fillId: input.fillId,
    leaderId: input.leaderId,
    followerId: input.followerId,
    assetId: input.assetId,
    protocolFee,
    appliedShareBps,
    grossLeaderShare,
    cappedLeaderShare,
    skippedReason: null,
  };
}

/**
 * Build ledger posts for a non-zero attribution.
 * Path: houseFees(trade) → rewardsEngine → leader available (existing recipes).
 */
export function planCopyFeeShareSettle(attribution: FeeShareAttribution): FeeShareSettlePlan {
  if (attribution.skippedReason !== null || attribution.cappedLeaderShare <= 0n) {
    throw new CopyError(
      'No fee-share to settle (cap or zero) — refuse rather than invent a payout',
      'trade.copy_settle_refused',
      COPY_FEE_SHARE_RESIDUAL,
    );
  }

  const windowId = `copy-fee:${attribution.fillId}`;
  const rewardId = `copy-leader-share:${attribution.fillId}:${attribution.leaderId}`;

  return {
    attribution,
    sweep: recipes.sweepFeesToRewards({
      windowId,
      sourceModule: 'trade',
      assetId: attribution.assetId,
      amount: attribution.cappedLeaderShare,
    }),
    payout: recipes.rewardPay({
      rewardId,
      userId: attribution.leaderId,
      assetId: attribution.assetId,
      amount: attribution.cappedLeaderShare,
      reason: 'trade.copy.fee_share',
    }),
  };
}

/** Post settle plan in order. Idempotent via recipe keys. */
export async function postCopyFeeShareSettle(ledger: LedgerClient, plan: FeeShareSettlePlan): Promise<void> {
  await ledger.post(plan.sweep);
  await ledger.post(plan.payout);
}

/** Explicit ban — any P&L-linked fee is forbidden in v1 (SPEC §3). */
export function refusePnlLinkedCopyFee(): never {
  throw new CopyError(
    'P&L-linked copy fees (performance / HWM / success) are forbidden — volume fee-share only after §8 rates',
    'trade.copy_pnl_fee_forbidden',
    COPY_FEE_SHARE_RESIDUAL,
  );
}

export function presentFeeShareAttribution(a: FeeShareAttribution) {
  return {
    fillId: a.fillId,
    leaderId: a.leaderId,
    followerId: a.followerId,
    assetId: a.assetId,
    protocolFee: formatAmount(a.protocolFee),
    appliedShareBps: a.appliedShareBps,
    grossLeaderShare: formatAmount(a.grossLeaderShare),
    cappedLeaderShare: formatAmount(a.cappedLeaderShare),
    skippedReason: a.skippedReason,
  };
}
