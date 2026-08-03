import type { ChannelRegistry } from './channels/registry.js';
import { ChannelDeliveryError, ChannelRefusal, OUT_OF_APP_CHANNELS, type ChannelId, type RefusalCode } from './channels/channel.js';
import { normaliseLocale, renderNotification } from './channels/render.js';
import type { ChannelTarget, DeliveryRecord, DeliveryStore, TargetStore } from './channel-store.js';
import type { Notification } from './store.js';
import { withNotifySpan } from './tracing.js';

/**
 * FAN-OUT.
 *
 * One notification, several channels, at-least-once bus delivery underneath.
 * Three properties have to hold at once and each one is load-bearing:
 *
 * 1. A REDELIVERED EVENT MUST NOT DOUBLE-NOTIFY. Every send is guarded by a
 *    claim on `(notification_id, channel)`. The guard is the database, not a
 *    process-local set, because two replicas consuming the same durable
 *    consumer would each hold their own set and each send.
 *
 * 2. A CHANNEL THAT DID NOT DELIVER MUST NOT READ AS DELIVERED. Every outcome
 *    is written back: accepted, refused with a code, failed with the detail.
 *    There is no path through this file where a message is dropped and nothing
 *    is written.
 *
 * 3. A TRANSIENT FAILURE MUST BE RETRIED, AND A PERMANENT ONE MUST NOT. The
 *    report says whether the caller should let the bus redeliver. Nak'ing a
 *    permanently broken address would burn the redelivery budget of every other
 *    channel on the same message and eventually park a notification that three
 *    other channels handled perfectly.
 *
 * WHICH CHANNELS ARE TRIED
 *
 *   in-app        always. It needs no credentials and no address, so it is the
 *                 honest fallback (§13) when the owner has obtained nothing.
 *   out-of-app    when the user has a CONFIRMED address for it. An address the
 *                 user never confirmed is not an address we may use.
 *
 * When the user has no confirmed address and the notification is `critical`, the
 * refusal is still recorded. A margin call that reached nobody but the inbox is
 * exactly the fact a borrower disputing a liquidation needs, and "we have no
 * way to contact you" has to be on the record at the moment it mattered — not
 * inferred later from an empty table.
 */

export interface DispatchOptions {
  /** Attempts per channel before the row is abandoned. Pair with the bus `maxDeliver`. */
  readonly maxAttempts: number;
  /** Operator switch for everything that leaves the platform. The inbox is unaffected. */
  readonly outOfAppEnabled: boolean;
}

export interface ChannelOutcome {
  readonly channel: ChannelId;
  readonly status: 'accepted' | 'refused' | 'failed' | 'abandoned' | 'already_accepted';
  readonly code: RefusalCode | null;
  readonly detail: string | null;
  /** True when the bus should redeliver so this channel gets another go. */
  readonly retryable: boolean;
}

export interface DispatchReport {
  readonly notificationId: string;
  readonly outcomes: readonly ChannelOutcome[];
  /** True when at least one channel wants another attempt. */
  readonly retry: boolean;
}

export class NotificationDispatcher {
  constructor(
    private readonly channels: ChannelRegistry,
    private readonly targets: TargetStore,
    private readonly deliveries: DeliveryStore,
    private readonly options: DispatchOptions,
  ) {}

  async dispatch(notification: Notification): Promise<DispatchReport> {
    return withNotifySpan(
      'notify.dispatch',
      { op: 'dispatch', kind: notification.kind, sourceSubject: notification.sourceSubject },
      async (span) => {
        const verified = await this.targets.verified(notification.userId);
        const byChannel = new Map<ChannelId, ChannelTarget>(verified.map((t) => [t.channel, t]));
        const outcomes: ChannelOutcome[] = [];

        // The inbox row already exists — the notification IS the in-app delivery.
        // Recording it as a delivery keeps one shape for "what happened to this
        // message across every channel", which is what the API answers.
        outcomes.push(await this.attempt(notification, 'inapp', notification.id, normaliseLocale(null)));

        for (const channel of OUT_OF_APP_CHANNELS) {
          const target = byChannel.get(channel);

          if (!this.options.outOfAppEnabled) {
            if (target) outcomes.push(await this.refuse(notification, channel, 'channel.disabled'));
            continue;
          }

          if (!target) {
            // Nothing was promised on a channel the user never gave us — except
            // when the message is critical, where silence is the thing worth
            // recording. See the header.
            if (notification.severity === 'critical') {
              outcomes.push(await this.refuse(notification, channel, 'channel.no_target'));
            }
            continue;
          }

          outcomes.push(await this.attempt(notification, channel, target.address, target.locale));
        }

        const retry = outcomes.some((o) => o.retryable);
        span.setAttribute('intafaced.notify.channels_attempted', outcomes.length);
        span.setAttribute('intafaced.notify.channels_accepted', outcomes.filter((o) => o.status === 'accepted').length);
        span.setAttribute('intafaced.notify.dispatch_retry', retry);

        return { notificationId: notification.id, outcomes, retry };
      },
    );
  }

  /** Record a refusal that the adapter never got a chance to make. */
  private async refuse(notification: Notification, channel: ChannelId, code: RefusalCode): Promise<ChannelOutcome> {
    const claim = await this.deliveries.claim(notification.id, channel, this.options.maxAttempts);
    if (!claim.claimed) return fromExistingClaim(channel, claim.reason, claim.record);

    // `attempted: false` — nothing was tried, so `attempted_at` stays NULL. That
    // column is the difference between "the provider was down" and "we never
    // had anywhere to send it", and collapsing the two loses the answer a
    // borrower is owed.
    await this.deliveries.settle({ id: claim.id, status: 'refused', refusalCode: code, attempted: false });
    return { channel, status: 'refused', code, detail: null, retryable: false };
  }

  private async attempt(notification: Notification, channel: ChannelId, address: string, locale: string): Promise<ChannelOutcome> {
    const claim = await this.deliveries.claim(notification.id, channel, this.options.maxAttempts);
    if (!claim.claimed) return fromExistingClaim(channel, claim.reason, claim.record);

    const adapter = this.channels.get(channel);
    const copy = renderNotification(notification, locale);

    try {
      const receipt = await adapter.deliver({
        notificationId: notification.id,
        userId: notification.userId,
        channel,
        kind: notification.kind,
        severity: notification.severity,
        titleKey: notification.titleKey,
        bodyKey: notification.bodyKey,
        title: copy.title,
        body: copy.body,
        href: notification.href,
        locale: normaliseLocale(locale),
        address,
        idempotencyKey: `${notification.id}:${channel}`,
      });

      await this.deliveries.settle({ id: claim.id, status: 'accepted', reference: receipt.reference, attempted: true });
      return { channel, status: 'accepted', code: null, detail: null, retryable: false };
    } catch (err) {
      if (err instanceof ChannelRefusal) {
        // The adapter declined before doing anything — no credentials, typically.
        await this.deliveries.settle({ id: claim.id, status: 'refused', refusalCode: err.code, detail: err.message, attempted: false });
        return { channel, status: 'refused', code: err.code, detail: err.message, retryable: false };
      }

      const retryable = err instanceof ChannelDeliveryError ? err.retryable : true;
      const detail = err instanceof Error ? err.message : String(err);
      // Out of attempts on this pass? Say so now rather than leaving a 'failed'
      // row that reads as "still being retried" when nothing will retry it.
      const exhausted = claim.attempt >= this.options.maxAttempts;
      const status = retryable && !exhausted ? 'failed' : 'abandoned';

      await this.deliveries.settle({
        id: claim.id,
        status,
        refusalCode: exhausted ? 'channel.attempts_exhausted' : null,
        detail,
        attempted: true,
      });
      return { channel, status, code: exhausted ? 'channel.attempts_exhausted' : null, detail, retryable: status === 'failed' };
    }
  }
}

/**
 * A claim we did not get. Never an error: the common case is a redelivery of
 * something already accepted, which is the guard doing its job.
 *
 * The outcome reports the row's OWN status rather than a status inferred from
 * why the claim was refused. A row that was abandoned must not come back as
 * "refused" — those words mean different things on this record, and a reader
 * settling a dispute reads them literally.
 */
function fromExistingClaim(
  channel: ChannelId,
  reason: 'already_accepted' | 'terminal' | 'exhausted',
  record: DeliveryRecord,
): ChannelOutcome {
  if (reason === 'already_accepted') {
    return { channel, status: 'already_accepted', code: null, detail: null, retryable: false };
  }
  return {
    channel,
    // 'pending' cannot reach here — claim only blocks on terminal or exhausted —
    // but the map is total so a future status cannot slip through as `undefined`.
    status: record.status === 'pending' ? 'failed' : record.status === 'accepted' ? 'already_accepted' : record.status,
    code: record.refusalCode,
    detail: record.detail,
    retryable: false,
  };
}
