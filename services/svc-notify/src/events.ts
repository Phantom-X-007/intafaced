import {
  bankMarginCalled,
  fillSettled,
  kycApproved,
  p2pEscrowLocked,
  p2pEscrowRefunded,
  p2pEscrowReleased,
  p2pTradeDisputed,
  rankUpdated,
  stakeCreated,
  wiringSocketReason,
  type EventBus,
  type EventName,
  type Handler,
  type Subscription,
} from '@intafaced/events';
import type { CreateResult, NotifyService } from './notify-service.js';

/**
 * EVENT WIRING — fan-out.
 *
 * Durable consumers survive restarts. Inserts are ON CONFLICT DO NOTHING at the
 * store layer and each out-of-app send is claimed on `(notification, channel)`,
 * so at-least-once redelivery writes one row and sends one message. When fan-out
 * is killed (`NOTIFY_FANOUT_ENABLED` / `notify.fanout`), handlers still ack
 * without writing or sending.
 *
 * BACKPRESSURE, AND WHAT IT MEANS TO NAK
 *
 * A handler throws only when a channel wants another attempt — a gateway that
 * timed out, a 503. JetStream redelivers, the inbox insert dedupes, and only the
 * channel that failed is retried. A handler that threw on a permanently broken
 * address would burn the redelivery budget for the whole message and eventually
 * park a notification that three other channels delivered perfectly.
 *
 * Nothing is lost by falling behind: the stream retains 90 days and durable
 * consumers resume where they stopped. A consumer that cannot be created at all
 * — its producer has never published, so the stream does not exist yet — is
 * reported as PENDING rather than silently skipped. See `SubscriptionReport`.
 *
 * A subject is safe to add here only when it is already published, maps to a
 * userId principal, and has clear user-facing meaning. No invented publishers.
 * Skipped (no user ids on payload): p2pDisputeResolved, p2pTradeExpired.
 * p2pTradeDisputed notifies openedBy only — the counterparty is not on the payload.
 */

/**
 * A consumer that could not be created, and the honest reason.
 *
 * DECLARED SOCKET, OR DEFECT — NEVER BOTH
 *
 * This used to be one flat list that produced one WARN per entry on every boot.
 * `bankMarginCalled` has been in it since svc-notify shipped, so the warning has
 * fired at every start for its whole life, and no boot has ever been free of it.
 *
 * A warning that is always there is not a warning. It is a permanent feature of
 * the log that teaches whoever reads it to skim past warnings — including the
 * next one, which will be about something that just broke.
 *
 * So a pending consumer is now one of exactly two things:
 *
 *   `socket` non-null   Somebody wrote down that this subject has no publisher
 *                       yet, in `WIRING_SOCKETS`, with a reason. Known, reviewed
 *                       and enforced by `pnpm scan:events`. Logged at INFO with
 *                       the recorded reason. Quiet, because it is accounted for.
 *
 *   `socket` null       Nothing in the repo admits this consumer cannot attach.
 *                       That is a defect. Logged at ERROR, counted on /ready, and
 *                       CI is already red on it — `scan:events` fails on an
 *                       undeclared orphan, so this state cannot reach `main`.
 *
 * Boot does not refuse either way, and that is deliberate: svc-notify's inbox is
 * healthy without any one consumer, and taking the whole inbox down over a single
 * dark subject would turn a wiring gap into an outage. The loudness lives where
 * it costs nothing — the gate, at the commit.
 */
export interface PendingConsumer {
  readonly event: EventName;
  readonly subject: string;
  readonly durable: string;
  readonly reason: string;
  /**
   * The reason recorded in `WIRING_SOCKETS` for this subject having no
   * publisher, or null when nothing has been written down. Null is the defect.
   */
  readonly socket: string | null;
}

export interface SubscriptionReport {
  readonly subscriptions: readonly Subscription[];
  /**
   * Consumers that do not exist yet, with the reason.
   *
   * Reported rather than thrown, because svc-notify's inbox API is perfectly
   * healthy without them; reported rather than swallowed, because "margin-call
   * notifications are not running" has to be visible from outside the process.
   * Surfaced on `/ready`, split by `socket` into declared and undeclared.
   */
  readonly pending: readonly PendingConsumer[];
}

/**
 * Throw when — and only when — a channel wants another attempt.
 *
 * The message names the channel on purpose. An operator reading a nak needs to
 * know which transport is unhappy, not that "dispatch failed".
 */
function nakIfRetryable(...results: readonly CreateResult[]): void {
  const wants = results.filter((r) => r.dispatch?.retry);
  if (wants.length === 0) return;
  const detail = wants
    .flatMap((r) => r.dispatch!.outcomes.filter((o) => o.retryable).map((o) => `${o.channel}: ${o.detail ?? 'unknown'}`))
    .join('; ');
  throw new Error(`notify fan-out wants a retry for ${wants[0]!.dispatch!.notificationId} — ${detail}`);
}

interface Attachment {
  subscription: Subscription | null;
  pending: PendingConsumer | null;
}

/**
 * Subscribe, or report why not.
 *
 * The failure this tolerates is real and specific: a durable consumer cannot be
 * created against a stream that does not exist, and a stream does not exist
 * until its owning service has connected a bus. `intafaced.bank.margin_call.created`
 * is in exactly that state until svc-bank wires one. Refusing to boot over it
 * would take the whole inbox down for every other subject; skipping it in
 * silence would leave nobody able to tell that margin-call notifications are
 * dark. So: attach what attaches, and report the rest by name.
 */
async function attach<K extends EventName>(
  bus: EventBus,
  event: K,
  subject: string,
  durable: string,
  handler: Handler<K>,
): Promise<Attachment> {
  try {
    return { subscription: await bus.subscribe(event, handler, { durable }), pending: null };
  } catch (err) {
    return {
      subscription: null,
      pending: {
        event,
        subject,
        durable,
        reason: err instanceof Error ? err.message : String(err),
        // The catalog is the single place a missing publisher is recorded, so
        // the boot log and `pnpm scan:events` cannot disagree about which
        // subjects are known-dark. One list, two readers.
        socket: wiringSocketReason(event, 'publisher'),
      },
    };
  }
}

export async function subscribeNotificationEvents(bus: EventBus, notify: NotifyService): Promise<SubscriptionReport> {
  const attachments: Attachment[] = [];

  attachments.push(
    await attach(bus, 'fillSettled', fillSettled.subject, 'notify-fill-settled', async (payload) => {
      nakIfRetryable(
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
        }),
      );
    }),
  );

  attachments.push(
    await attach(bus, 'p2pEscrowLocked', p2pEscrowLocked.subject, 'notify-p2p-escrow-locked', async (payload) => {
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

      // Both sides of the escrow need the signal; the unique key includes user_id.
      const seller = await notify.create({ ...base, userId: payload.sellerId, sourceIdempotencyKey: `${payload.tradeId}:seller` });
      const buyer = await notify.create({ ...base, userId: payload.buyerId, sourceIdempotencyKey: `${payload.tradeId}:buyer` });
      nakIfRetryable(seller, buyer);
    }),
  );

  attachments.push(
    await attach(bus, 'p2pEscrowReleased', p2pEscrowReleased.subject, 'notify-p2p-escrow-released', async (payload) => {
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

      const seller = await notify.create({ ...base, userId: payload.sellerId, sourceIdempotencyKey: `${payload.tradeId}:seller` });
      const buyer = await notify.create({ ...base, userId: payload.buyerId, sourceIdempotencyKey: `${payload.tradeId}:buyer` });
      nakIfRetryable(seller, buyer);
    }),
  );

  attachments.push(
    await attach(bus, 'p2pEscrowRefunded', p2pEscrowRefunded.subject, 'notify-p2p-escrow-refunded', async (payload) => {
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

      const seller = await notify.create({ ...base, userId: payload.sellerId, sourceIdempotencyKey: `${payload.tradeId}:seller` });
      const buyer = await notify.create({ ...base, userId: payload.buyerId, sourceIdempotencyKey: `${payload.tradeId}:buyer` });
      nakIfRetryable(seller, buyer);
    }),
  );

  attachments.push(
    await attach(bus, 'p2pTradeDisputed', p2pTradeDisputed.subject, 'notify-p2p-trade-disputed', async (payload) => {
      // Payload only carries openedBy — no counterparty id. Honest single-recipient fan-out.
      nakIfRetryable(
        await notify.create({
          userId: payload.openedBy,
          kind: 'p2p.trade.disputed',
          titleKey: 'notify.p2p.trade.disputed.title',
          bodyKey: 'notify.p2p.trade.disputed.body',
          params: {
            tradeId: payload.tradeId,
            disputeId: payload.disputeId,
            reason: payload.reason,
            moderatorDeadline: payload.moderatorDeadline,
          },
          href: `/p2p/trades/${payload.tradeId}`,
          severity: 'action',
          sourceSubject: p2pTradeDisputed.subject,
          sourceIdempotencyKey: payload.disputeId,
        }),
      );
    }),
  );

  attachments.push(
    await attach(bus, 'kycApproved', kycApproved.subject, 'notify-kyc-approved', async (payload) => {
      nakIfRetryable(
        await notify.create({
          userId: payload.userId,
          kind: 'identity.kyc.approved',
          titleKey: 'notify.identity.kyc.approved.title',
          bodyKey: 'notify.identity.kyc.approved.body',
          params: { tier: payload.tier, jurisdiction: payload.jurisdiction },
          href: '/settings/verification',
          severity: 'action',
          sourceSubject: kycApproved.subject,
          sourceIdempotencyKey: `${payload.userId}:${payload.tier}`,
        }),
      );
    }),
  );

  attachments.push(
    await attach(bus, 'rankUpdated', rankUpdated.subject, 'notify-rank-updated', async (payload) => {
      nakIfRetryable(
        await notify.create({
          userId: payload.userId,
          kind: 'identity.rank.updated',
          titleKey: 'notify.identity.rank.updated.title',
          bodyKey: 'notify.identity.rank.updated.body',
          params: { rank: payload.rank, previousRank: payload.previousRank, xp: payload.xp },
          href: '/profile/rank',
          severity: 'action',
          sourceSubject: rankUpdated.subject,
          sourceIdempotencyKey: `${payload.userId}:${payload.previousRank}:${payload.rank}`,
        }),
      );
    }),
  );

  attachments.push(
    await attach(bus, 'stakeCreated', stakeCreated.subject, 'notify-stake-created', async (payload) => {
      nakIfRetryable(
        await notify.create({
          userId: payload.userId,
          kind: 'token.stake.created',
          titleKey: 'notify.token.stake.created.title',
          bodyKey: 'notify.token.stake.created.body',
          params: { stakeId: payload.stakeId, amount: payload.amount, tier: payload.tier, unlocksAt: payload.unlocksAt },
          href: `/token/stakes/${payload.stakeId}`,
          severity: 'info',
          sourceSubject: stakeCreated.subject,
          sourceIdempotencyKey: payload.stakeId,
        }),
      );
    }),
  );

  attachments.push(
    await attach(bus, 'bankMarginCalled', bankMarginCalled.subject, 'notify-bank-margin-called', async (payload) => {
      /**
       * THE MONEY-ADJACENT ONE.
       *
       * `critical` is not decoration. Severity `critical` is what makes the
       * dispatcher record a refusal on every out-of-app channel even when the
       * borrower registered none — so if this loan is liquidated and the
       * borrower asks whether they were warned, the answer is a row rather than
       * an inference from an empty table.
       *
       * The business key is `<loanId>:<sequence>`, not the loan id: a loan can
       * be called, cured and called again, and the second call is a different
       * fact that must produce a second notification. Keying on loan id alone
       * would silently swallow every call after the first.
       */
      nakIfRetryable(
        await notify.create({
          userId: payload.userId,
          kind: 'bank.margin_call',
          titleKey: 'notify.bank.margin_call.title',
          bodyKey: 'notify.bank.margin_call.body',
          params: {
            loanId: payload.loanId,
            ltvBps: payload.ltvBps,
            cureCollateralAmount: payload.cureCollateralAmount,
            collateralAssetId: payload.collateralAssetId,
            graceExpiresAt: payload.graceExpiresAt,
            calledAt: payload.calledAt,
            sequence: payload.sequence,
          },
          href: `/bank/loans/${payload.loanId}`,
          severity: 'critical',
          sourceSubject: bankMarginCalled.subject,
          sourceIdempotencyKey: `${payload.loanId}:${payload.sequence}`,
        }),
      );
    }),
  );

  return {
    subscriptions: attachments.map((a) => a.subscription).filter((s): s is Subscription => s !== null),
    pending: attachments.map((a) => a.pending).filter((p): p is PendingConsumer => p !== null),
  };
}
