/**
 * Copy trading service (trade.copy Stage — D-S-03 / SPEC-SOVEREIGN…).
 *
 * Default fee-share + jurisdiction laws are unpublished → follow and fee
 * payout refuse with DIRECTION §8 residual. Never invents leader_share_bps,
 * never pools funds, never ranks by returns, never charges on P&L.
 * Value moves only via ledger-client recipes when §8 rates are published.
 */

import { randomUUID } from 'node:crypto';
import { parseAmount, type Amount, type LedgerClient } from '@intafaced/ledger-client';
import type { Principal } from '@intafaced/auth';
import { CopyError } from './errors.js';
import {
  copyLawResidual,
  copyLawStatusLine,
  UNPUBLISHED_COPY_FEE_SHARE_LAW,
  UNPUBLISHED_COPY_JURISDICTION_LAW,
  type CopyFeeShareLaw,
  type CopyJurisdictionLaw,
} from './fee-share-law.js';
import { assertCopyRegionAllowed, parseCopyEnvelope, presentCopyFollow, type CopyFollow } from './follows.js';
import {
  attributeCopyFeeShare,
  planCopyFeeShareSettle,
  postCopyFeeShareSettle,
  presentFeeShareAttribution,
  refusePnlLinkedCopyFee,
} from './fee-share.js';
import { parseLeaderFillObservation, planMirror, presentMirrorPlan, refuseCopyLeaderRanking, type MirrorSide } from './mirror.js';

export interface CopyServiceOptions {
  feeShareLaw?: CopyFeeShareLaw;
  jurisdictionLaw?: CopyJurisdictionLaw;
  now?: () => Date;
}

export class CopyService {
  private readonly follows = new Map<string, CopyFollow>();
  /** followId → aggregate open exposure (notional). */
  private readonly exposure = new Map<string, Amount>();
  /** `${leaderId}:${followerId}` → earnings paid this period. */
  private readonly earningsPaid = new Map<string, Amount>();
  /** `${leaderId}:${followerId}` → round-trips this period. */
  private readonly roundTrips = new Map<string, number>();
  private readonly feeShareLaw: CopyFeeShareLaw;
  private readonly jurisdictionLaw: CopyJurisdictionLaw;
  private readonly now: () => Date;

  constructor(
    private readonly ledger: LedgerClient,
    options: CopyServiceOptions = {},
  ) {
    this.feeShareLaw = options.feeShareLaw ?? UNPUBLISHED_COPY_FEE_SHARE_LAW;
    this.jurisdictionLaw = options.jurisdictionLaw ?? UNPUBLISHED_COPY_JURISDICTION_LAW;
    this.now = options.now ?? (() => new Date());
  }

  deskStatus() {
    return {
      feeSharePublished: this.feeShareLaw.published === true,
      jurisdictionPublished: this.jurisdictionLaw.published === true,
      statusLine: copyLawStatusLine(this.feeShareLaw, this.jurisdictionLaw),
      residual: copyLawResidual(this.feeShareLaw, this.jurisdictionLaw),
    };
  }

  /**
   * Follow a leader under a scoped envelope. Jurisdiction law must be published.
   * Does not move value — follower funds stay in follower account.
   */
  follow(
    principal: Principal,
    input: {
      leaderId: string;
      region: string;
      permittedMarkets: readonly string[];
      maxNotionalPerOrder: string;
      maxAggregateExposure: string;
      expiresAt: string;
    },
  ) {
    const region = assertCopyRegionAllowed(this.jurisdictionLaw, input.region);
    const leaderId = input.leaderId.trim();
    if (!leaderId) {
      throw new CopyError('leaderId is required', 'trade.copy_envelope_invalid');
    }
    if (leaderId === principal.userId) {
      throw new CopyError('Cannot follow yourself', 'trade.copy_self_follow');
    }

    for (const f of this.follows.values()) {
      if (f.followerId === principal.userId && f.leaderId === leaderId) {
        throw new CopyError('Already following this leader', 'trade.copy_already_following');
      }
    }

    const envelope = parseCopyEnvelope({
      permittedMarkets: input.permittedMarkets,
      maxNotionalPerOrder: input.maxNotionalPerOrder,
      maxAggregateExposure: input.maxAggregateExposure,
      expiresAt: input.expiresAt,
      now: this.now(),
    });

    const follow: CopyFollow = {
      followId: randomUUID(),
      followerId: principal.userId,
      leaderId,
      envelope,
      region,
      createdAt: this.now(),
      feeShareKilled: false,
    };
    this.follows.set(follow.followId, follow);
    this.exposure.set(follow.followId, 0n);
    return presentCopyFollow(follow);
  }

  /** Unilateral unfollow — does not require fee-share law; always allowed. */
  unfollow(principal: Principal, input: { followId: string }) {
    const follow = this.follows.get(input.followId);
    if (!follow) {
      throw new CopyError('Follow not found', 'trade.copy_not_following');
    }
    if (follow.followerId !== principal.userId) {
      throw new CopyError('Follow belongs to another user', 'trade.copy_not_following');
    }
    this.follows.delete(follow.followId);
    this.exposure.delete(follow.followId);
    return { followId: follow.followId, revoked: true as const };
  }

  /** Kill fee-share for a follow (churn / abuse brake). Follow may remain. */
  killFeeShare(principal: Principal, input: { followId: string }) {
    const follow = this.follows.get(input.followId);
    if (!follow) {
      throw new CopyError('Follow not found', 'trade.copy_not_following');
    }
    if (follow.followerId !== principal.userId) {
      throw new CopyError('Follow belongs to another user', 'trade.copy_not_following');
    }
    const next: CopyFollow = { ...follow, feeShareKilled: true };
    this.follows.set(next.followId, next);
    return presentCopyFollow(next);
  }

  /**
   * Plan a mirror of a leader fill for one of the caller's follows.
   * Typed refuse on cap / market / expiry — never invent a different shape.
   */
  planMirrorForFollow(
    principal: Principal,
    input: {
      followId: string;
      marketId: string;
      side: MirrorSide;
      qty: string;
      notional: string;
    },
  ) {
    const follow = this.follows.get(input.followId);
    if (!follow) {
      throw new CopyError('Follow not found', 'trade.copy_not_following');
    }
    if (follow.followerId !== principal.userId) {
      throw new CopyError('Follow belongs to another user', 'trade.copy_not_following');
    }

    const observation = parseLeaderFillObservation({
      leaderId: follow.leaderId,
      marketId: input.marketId,
      side: input.side,
      qty: input.qty,
      notional: input.notional,
      observedAt: this.now(),
    });

    const current = this.exposure.get(follow.followId) ?? 0n;
    const plan = planMirror({
      follow,
      observation,
      currentExposure: current,
      now: this.now(),
    });
    this.exposure.set(follow.followId, current + plan.notional);
    return presentMirrorPlan(plan);
  }

  /**
   * Attribute + settle leader fee-share for a follower fill via ledger-client.
   * Blank §8 rates → refuse. Cap / kill → typed skip or refuse.
   */
  async settleFeeShare(
    principal: Principal,
    input: {
      followId: string;
      fillId: string;
      assetId: string;
      followerFillNotional: string;
      protocolFeeBps: number;
    },
  ) {
    const follow = this.follows.get(input.followId);
    if (!follow) {
      throw new CopyError('Follow not found', 'trade.copy_not_following');
    }
    if (follow.followerId !== principal.userId) {
      throw new CopyError('Follow belongs to another user', 'trade.copy_not_following');
    }

    const key = `${follow.leaderId}:${follow.followerId}`;
    const attribution = attributeCopyFeeShare({
      law: this.feeShareLaw,
      fillId: input.fillId,
      leaderId: follow.leaderId,
      followerId: follow.followerId,
      assetId: input.assetId.trim(),
      followerFillNotional: parseAmount(input.followerFillNotional),
      protocolFeeBps: input.protocolFeeBps,
      roundTripsThisPeriod: this.roundTrips.get(key) ?? 0,
      earningsPaidThisPeriod: this.earningsPaid.get(key) ?? 0n,
      feeShareKilled: follow.feeShareKilled,
    });

    this.roundTrips.set(key, (this.roundTrips.get(key) ?? 0) + 1);

    if (attribution.skippedReason !== null) {
      return { ...presentFeeShareAttribution(attribution), settled: false as const };
    }

    const plan = planCopyFeeShareSettle(attribution);
    await postCopyFeeShareSettle(this.ledger, plan);
    this.earningsPaid.set(key, (this.earningsPaid.get(key) ?? 0n) + attribution.cappedLeaderShare);
    return { ...presentFeeShareAttribution(attribution), settled: true as const };
  }

  /** Forbidden surfaces — explicit refuse for honesty tests. */
  rankLeadersByReturns(): never {
    return refuseCopyLeaderRanking();
  }

  chargePnlPerformanceFee(): never {
    return refusePnlLinkedCopyFee();
  }
}
