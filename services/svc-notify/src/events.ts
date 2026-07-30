import { fillSettled, kycApproved, p2pEscrowLocked, type EventBus, type Subscription } from '@intafaced/events';
import type { NotifyService } from './notify-service.js';

/**
 * EVENT WIRING — in-app fan-out.
 *
 * Durable consumers survive restarts. Inserts are ON CONFLICT DO NOTHING at the
 * store layer, so at-least-once redelivery is a no-op. When fan-out is killed
 * (`NOTIFY_FANOUT_ENABLED` / `notify.fanout`), handlers still ack without writing.
 *
 * Push / email / SMS: §13 sockets. Do not add channel senders here.
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

  return [fillSub, escrowSub, kycSub];
}
