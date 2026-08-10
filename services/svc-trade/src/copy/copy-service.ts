/**
 * Copy trading service (trade.copy Stage — D-S-03 / SPEC-SOVEREIGN…).
 *
 * Default fee-share + jurisdiction laws are unpublished → follow and fee
 * payout refuse with DIRECTION §8 residual. Never invents leader_share_bps,
 * never pools funds, never ranks by returns, never charges on P&L.
 * Value moves only via ledger-client recipes when §8 rates are published.
 *
 * Follow/exposure state is durable via CopyFollowStore (Memory by default;
 * production mounts SqlCopyFollowStore — needs copy_follows + copy_mirrored_fills).
 * Product surface: tRPC `copy.*` on the trade router (follow / kill / unfollow /
 * settleFeeShare / deskStatus). Blank §8 env laws refuse at the door.
 */

import { randomUUID } from 'node:crypto';
import { formatAmount, parseAmount, type LedgerClient } from '@intafaced/ledger-client';
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
import { MemoryCopyFollowStore, type CopyFollowStore } from './follow-store.js';

export interface CopyServiceOptions {
  feeShareLaw?: CopyFeeShareLaw;
  jurisdictionLaw?: CopyJurisdictionLaw;
  now?: () => Date;
  /** Defaults to in-memory. Production wires SqlCopyFollowStore. */
  store?: CopyFollowStore;
}

export class CopyService {
  private readonly store: CopyFollowStore;
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
    this.store = options.store ?? new MemoryCopyFollowStore();
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
   * List the caller's own follows (product desk). Never invents other users'
   * envelopes — store is filtered by followerId after the full list read.
   */
  async listMyFollows(principal: Principal) {
    const all = await this.store.listFollows();
    return all.filter((f) => f.followerId === principal.userId).map(presentCopyFollow);
  }

  /**
   * Follow a leader under a scoped envelope. Jurisdiction law must be published.
   * Does not move value — follower funds stay in follower account.
   */
  async follow(
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

    for (const f of await this.store.listFollows()) {
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
    await this.store.saveFollow(follow, 0n);
    return presentCopyFollow(follow);
  }

  /** Unilateral unfollow — does not require fee-share law; always allowed. */
  async unfollow(principal: Principal, input: { followId: string }) {
    const follow = await this.store.getFollow(input.followId);
    if (!follow) {
      throw new CopyError('Follow not found', 'trade.copy_not_following');
    }
    if (follow.followerId !== principal.userId) {
      throw new CopyError('Follow belongs to another user', 'trade.copy_not_following');
    }
    // The churn counters deliberately SURVIVE this.
    //
    // They are keyed `leader:follower`, not on `followId`, and that is correct:
    // SPEC-SOVEREIGN caps leader earnings "per follower per period" and decays
    // the rate with turnover, so the unit is the pair and the period — not the
    // envelope. Clearing them here would make `unfollow` — which is unilateral,
    // needs no law, and is always allowed — a free reset of the abuse brake:
    // farm to the cap, unfollow, re-follow, farm again, unbounded, for the cost
    // of two API calls. That is precisely what the cap exists to stop.
    //
    // (The counters are in fact LIFETIME rather than per-period today, because
    // `copy_period_stats` has no period column. That is a real gap and the fix
    // is a period key, not a user-triggered delete.)
    await this.store.deleteFollow(follow.followId);
    return { followId: follow.followId, revoked: true as const };
  }

  /** Kill fee-share for a follow (churn / abuse brake). Follow may remain. */
  async killFeeShare(principal: Principal, input: { followId: string }) {
    const follow = await this.store.getFollow(input.followId);
    if (!follow) {
      throw new CopyError('Follow not found', 'trade.copy_not_following');
    }
    if (follow.followerId !== principal.userId) {
      throw new CopyError('Follow belongs to another user', 'trade.copy_not_following');
    }
    const next: CopyFollow = { ...follow, feeShareKilled: true };
    await this.store.saveFollow(next);
    return presentCopyFollow(next);
  }

  /**
   * Plan a mirror of a leader fill for one of the caller's follows.
   * Typed refuse on cap / market / expiry — never invent a different shape.
   *
   * `fillId` is required (engine business key). The store claims each fillId
   * once per follow: a redelivered observation returns the prior plan and does
   * not bump exposure a second time. Same shape as fee-share settle's fillId.
   *
   * Exposure is claimed inside `claimMirrorFill` under the same exclusive key
   * as `addExposureIfUnderCap` (#1191), so concurrent distinct fills still
   * cannot both pass a stale near-cap read.
   */
  async planMirrorForFollow(
    principal: Principal,
    input: {
      followId: string;
      /** Leader fill business key — required; redelivery must not double-mirror. */
      fillId: string;
      marketId: string;
      side: MirrorSide;
      qty: string;
      notional: string;
    },
  ) {
    const follow = await this.store.getFollow(input.followId);
    if (!follow) {
      throw new CopyError('Follow not found', 'trade.copy_not_following');
    }
    if (follow.followerId !== principal.userId) {
      throw new CopyError('Follow belongs to another user', 'trade.copy_not_following');
    }

    const observation = parseLeaderFillObservation({
      fillId: input.fillId,
      leaderId: follow.leaderId,
      marketId: input.marketId,
      side: input.side,
      qty: input.qty,
      notional: input.notional,
      observedAt: this.now(),
    });

    // Fast path: already claimed this leader fill under this follow.
    const prior = await this.store.getMirroredFill(follow.followId, observation.fillId);
    if (prior) {
      return presentMirrorPlan({ ...prior, reason: 'within_envelope' });
    }

    const current = await this.store.getExposure(follow.followId);
    // Envelope / market / expiry / per-order checks — may throw typed refuse.
    // Cap is re-checked inside claimMirrorFill under the follow exclusive lock
    // so a concurrent first-claim cannot overshoot even if this read is stale.
    const planned = planMirror({
      follow,
      observation,
      currentExposure: current,
      now: this.now(),
    });

    const claimed = await this.store.claimMirrorFill({
      followId: follow.followId,
      fillId: observation.fillId,
      maxAggregate: follow.envelope.maxAggregateExposure,
      plan: {
        fillId: planned.fillId,
        followId: planned.followId,
        followerId: planned.followerId,
        leaderId: planned.leaderId,
        marketId: planned.marketId,
        side: planned.side,
        qty: planned.qty,
        notional: planned.notional,
      },
    });

    if (claimed.status === 'duplicate') {
      // Lost the race to another delivery of the same fill — return its plan.
      return presentMirrorPlan({ ...claimed.plan, reason: 'within_envelope' });
    }
    if (claimed.status === 'cap_exceeded') {
      throw new CopyError(
        `Mirror would exceed aggregate exposure cap ${formatAmount(follow.envelope.maxAggregateExposure)}`,
        'trade.copy_cap_exceeded',
      );
    }
    return presentMirrorPlan({ ...claimed.plan, reason: 'within_envelope' });
  }

  /**
   * Attribute + settle leader fee-share for a follower fill via ledger-client.
   * Blank §8 rates → refuse. Cap / kill → typed skip or refuse.
   *
   * ── Reserve-then-post (closes the concurrent over-pay race) ───────────────
   *
   * Order: attribute gross/capped intent → **atomic reserve** under the period
   * cap → post ledger with the reserved amount → **release** on ledger failure.
   * Two fills with different fillIds (different business keys) can no longer
   * both pass a stale earningsPaid read and both move money past the cap.
   *
   * Ledger keys stay on fillId. Period boundary (D11) is not invented here —
   * pair-lifetime counters remain as today.
   * Same-fill redelivery on the mirror path is closed via claimMirrorFill.
   * Same-fill redelivery on **this** path is closed via runFeeShareSettleOnce —
   * reserveEarnings must not fire twice for one fillId (period poison).
   */
  async settleFeeShare(
    principal: Principal,
    input: {
      followId: string;
      fillId: string;
      assetId: string;
      followerFillNotional: string;
      protocolFeeBps: number;
      /** Settled fill fee when known — preferred over notional×bps invent. */
      fillFeeAmount?: string;
    },
  ) {
    const follow = await this.store.getFollow(input.followId);
    if (!follow) {
      throw new CopyError('Follow not found', 'trade.copy_not_following');
    }
    if (follow.followerId !== principal.userId) {
      throw new CopyError('Follow belongs to another user', 'trade.copy_not_following');
    }

    const once = await this.store.runFeeShareSettleOnce(follow.followId, input.fillId, async () => {
      const key = `${follow.leaderId}:${follow.followerId}`;
      const period = await this.store.getPeriodStats(key);
      const attribution = attributeCopyFeeShare({
        law: this.feeShareLaw,
        fillId: input.fillId,
        leaderId: follow.leaderId,
        followerId: follow.followerId,
        assetId: input.assetId.trim(),
        followerFillNotional: parseAmount(input.followerFillNotional),
        protocolFeeBps: input.protocolFeeBps,
        ...(input.fillFeeAmount !== undefined ? { fillFeeAmount: parseAmount(input.fillFeeAmount) } : {}),
        roundTripsThisPeriod: period.roundTrips,
        earningsPaidThisPeriod: period.earningsPaid,
        feeShareKilled: follow.feeShareKilled,
      });

      // Cap is owner-published law only — never invent. requirePublished ran inside attribute.
      const law = this.feeShareLaw;
      if (law.published !== true) {
        // attributeCopyFeeShare already throws on blank; this is defensive for types.
        throw new CopyError(
          'Copy fee-share is refuse-closed until owner publishes DIRECTION §8 leader_share_bps',
          'trade.copy_fee_share_blank',
        );
      }
      const cap = parseAmount(law.earningsCapPerFollower);

      // Intended claim: 0 when attribute already skipped (cap/zero), else capped share.
      // reserveEarnings always +1 round-trip so decay still advances on skips.
      const intend = attribution.skippedReason !== null ? 0n : attribution.cappedLeaderShare;
      const reserved = await this.store.reserveEarnings(key, intend, cap);

      if (reserved.reserved <= 0n) {
        const skipped =
          attribution.skippedReason !== null
            ? attribution
            : {
                ...attribution,
                cappedLeaderShare: 0n,
                skippedReason: 'cap_reached' as const,
              };
        return {
          fillId: skipped.fillId,
          followId: follow.followId,
          leaderId: skipped.leaderId,
          followerId: skipped.followerId,
          assetId: skipped.assetId,
          protocolFee: skipped.protocolFee,
          appliedShareBps: skipped.appliedShareBps,
          grossLeaderShare: skipped.grossLeaderShare,
          cappedLeaderShare: skipped.cappedLeaderShare,
          skippedReason: skipped.skippedReason,
          settled: false as const,
        };
      }

      const finalAttribution = {
        ...attribution,
        cappedLeaderShare: reserved.reserved,
        skippedReason: null as null,
      };
      const plan = planCopyFeeShareSettle(finalAttribution);
      try {
        await postCopyFeeShareSettle(this.ledger, plan);
      } catch (err) {
        await this.store.releaseEarnings(key, reserved.reserved);
        throw err;
      }
      return {
        fillId: finalAttribution.fillId,
        followId: follow.followId,
        leaderId: finalAttribution.leaderId,
        followerId: finalAttribution.followerId,
        assetId: finalAttribution.assetId,
        protocolFee: finalAttribution.protocolFee,
        appliedShareBps: finalAttribution.appliedShareBps,
        grossLeaderShare: finalAttribution.grossLeaderShare,
        cappedLeaderShare: finalAttribution.cappedLeaderShare,
        skippedReason: null as null,
        settled: true as const,
      };
    });

    const record = once.record;
    return {
      ...presentFeeShareAttribution({
        fillId: record.fillId,
        leaderId: record.leaderId,
        followerId: record.followerId,
        assetId: record.assetId,
        protocolFee: record.protocolFee,
        appliedShareBps: record.appliedShareBps,
        grossLeaderShare: record.grossLeaderShare,
        cappedLeaderShare: record.cappedLeaderShare,
        skippedReason: record.skippedReason,
      }),
      settled: record.settled,
    };
  }

  /** Forbidden surfaces — explicit refuse for honesty tests. */
  rankLeadersByReturns(): never {
    return refuseCopyLeaderRanking();
  }

  chargePnlPerformanceFee(): never {
    return refusePnlLinkedCopyFee();
  }
}
