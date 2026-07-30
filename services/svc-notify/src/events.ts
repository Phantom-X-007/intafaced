import {
  fillSettled,
  kycApproved,
  p2pEscrowLocked,
  p2pEscrowRefunded,
  p2pEscrowReleased,
  rankUpdated,
  stakeCreated,
  type EventBus,
  type Subscription,
} from '@intafaced/events';
import type { NotifyService } from './notify-service.js';

/**
 * EVENT WIRING — in-app fan-out.
 *
 * Durable consumers survive restarts. Inserts are ON CONFLICT DO NOTHING at the
 * store layer, so at-least-once redelivery is a no-op. When fan-out is killed
 * (`NOTIFY_FANOUT_ENABLED` / `notify.fanout`), handlers still ack without writing.
 *
 * Push / email / SMS: §13 sockets. Do not add channel senders here.
 *
 * Safe to add only when the subject is already published, maps to a userId
 * principal, and has clear user-facing meaning. No invented publishers.
 * p2pDisputeResolved is skipped: payload has no buyer/seller user ids.
 */

export async function subscribeNotificationEvents(bus: EventBus, notify: NotifyService): Promise<Subscription[]> {
  const fillSub = await bus.subscribe(
    'fillSettled',
    async (payload) => {
      await notify.create({
        userId: payload.userId,
        kind: 'trade.fill',
        titleKey: 'notify.trade.fill.title',
        bodyKey: 'notify.trade.fill.body',
        params: {
          fillId: payload.fillId,
          orderId: payload.orderId,
          marketId: payload.marketId,
          side: payload.side,
          price: payload.price,
          qty: payload.qty,
        },
        href: `/trade/orders/${payload.orderId}`,
        severity: 'info',
        sourceSubject: fillSettled.subject,
        sourceIdempotencyKey: payload.fillId,
      });
    },
    { durable: 'notify-fill-settled' },
  );

  const escrowSub = await bus.subscribe(
    'p2pEscrowLocked',
    async (payload) => {
      const base = {
        kind: 'p2p.escrow.locked',
        titleKey: 'notify.p2p.escrow.locked.title',
        bodyKey: 'notify.p2p.escrow.locked.body',
        params: {
          tradeId: payload.tradeId,
          asset: payload.asset,
          amount: payload.amount,
          fiatCurrency: payload.fiatCurrency,
          fiatAmount: payload.fiatAmount,
        },
        href: `/p2p/trades/${payload.tradeId}`,
        severity: 'action' as const,
        sourceSubject: p2pEscrowLocked.subject,
      };

      // Both sides of the escrow need the signal; unique key includes user_id.
      await notify.create({
        ...base,
        userId: payload.sellerId,
        sourceIdempotencyKey: `${payload.tradeId}:seller`,
      });
      await notify.create({
        ...base,
        userId: payload.buyerId,
        sourceIdempotencyKey: `${payload.tradeId}:buyer`,
      });
    },
    { durable: 'notify-p2p-escrow-locked' },
  );

  const escrowReleasedSub = await bus.subscribe(
    'p2pEscrowReleased',
    async (payload) => {
      const base = {
        kind: 'p2p.escrow.released',
        titleKey: 'notify.p2p.escrow.released.title',
        bodyKey: 'notify.p2p.escrow.released.body',
        params: {
          tradeId: payload.tradeId,
          asset: payload.asset,
          amount: payload.amount,
          fee: payload.fee,
          resolvedBy: payload.resolvedBy,
        },
        href: `/p2p/trades/${payload.tradeId}`,
        severity: 'info' as const,
        sourceSubject: p2pEscrowReleased.subject,
      };

      await notify.create({
        ...base,
        userId: payload.sellerId,
        sourceIdempotencyKey: `${payload.tradeId}:seller`,
      });
      await notify.create({
        ...base,
        userId: payload.buyerId,
        sourceIdempotencyKey: `${payload.tradeId}:buyer`,
      });
    },
    { durable: 'notify-p2p-escrow-released' },
  );

  const escrowRefundedSub = await bus.subscribe(
    'p2pEscrowRefunded',
    async (payload) => {
      const base = {
        kind: 'p2p.escrow.refunded',
        titleKey: 'notify.p2p.escrow.refunded.title',
        bodyKey: 'notify.p2p.escrow.refunded.body',
        params: {
          tradeId: payload.tradeId,
          asset: payload.asset,
          amount: payload.amount,
          resolvedBy: payload.resolvedBy,
          reason: payload.reason,
        },
        href: `/p2p/trades/${payload.tradeId}`,
        severity: 'action' as const,
        sourceSubject: p2pEscrowRefunded.subject,
      };

      await notify.create({
        ...base,
        userId: payload.sellerId,
        sourceIdempotencyKey: `${payload.tradeId}:seller`,
      });
      await notify.create({
        ...base,
        userId: payload.buyerId,
        sourceIdempotencyKey: `${payload.tradeId}:buyer`,
      });
    },
    { durable: 'notify-p2p-escrow-refunded' },
  );

  const kycSub = await bus.subscribe(
    'kycApproved',
    async (payload) => {
      await notify.create({
        userId: payload.userId,
        kind: 'identity.kyc.approved',
        titleKey: 'notify.identity.kyc.approved.title',
        bodyKey: 'notify.identity.kyc.approved.body',
        params: {
          tier: payload.tier,
          jurisdiction: payload.jurisdiction,
        },
        href: '/settings/verification',
        severity: 'action',
        sourceSubject: kycApproved.subject,
        sourceIdempotencyKey: `${payload.userId}:${payload.tier}`,
      });
    },
    { durable: 'notify-kyc-approved' },
  );

  const rankSub = await bus.subscribe(
    'rankUpdated',
    async (payload) => {
      await notify.create({
        userId: payload.userId,
        kind: 'identity.rank.updated',
        titleKey: 'notify.identity.rank.updated.title',
        bodyKey: 'notify.identity.rank.updated.body',
        params: {
          rank: payload.rank,
          previousRank: payload.previousRank,
          xp: payload.xp,
        },
        href: '/profile/rank',
        severity: 'action',
        sourceSubject: rankUpdated.subject,
        sourceIdempotencyKey: `${payload.userId}:${payload.previousRank}:${payload.rank}`,
      });
    },
    { durable: 'notify-rank-updated' },
  );

  const stakeSub = await bus.subscribe(
    'stakeCreated',
    async (payload) => {
      await notify.create({
        userId: payload.userId,
        kind: 'token.stake.created',
        titleKey: 'notify.token.stake.created.title',
        bodyKey: 'notify.token.stake.created.body',
        params: {
          stakeId: payload.stakeId,
          amount: payload.amount,
          tier: payload.tier,
          unlocksAt: payload.unlocksAt,
        },
        href: `/token/stakes/${payload.stakeId}`,
        severity: 'info',
        sourceSubject: stakeCreated.subject,
        sourceIdempotencyKey: payload.stakeId,
      });
    },
    { durable: 'notify-stake-created' },
  );

  return [fillSub, escrowSub, escrowReleasedSub, escrowRefundedSub, kycSub, rankSub, stakeSub];
}
