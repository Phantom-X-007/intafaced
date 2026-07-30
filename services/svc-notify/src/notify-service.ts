import { createHash, randomInt } from 'node:crypto';
import type { InsertNotificationInput, ListQuery, ListResult, Notification, NotifyStore } from './store.js';
import type { ChannelTarget, DeliveryRecord, DeliveryStore, TargetStore } from './channel-store.js';
import type { DispatchReport, NotificationDispatcher } from './dispatch.js';
import type { ChannelRegistry, ChannelStatus } from './channels/registry.js';
import { ChannelRefusal, type OutOfAppChannel, type RefusalCode } from './channels/channel.js';
import { normaliseLocale, renderVerification } from './channels/render.js';
import { withNotifySpan } from './tracing.js';

/**
 * svc-notify — event-driven fan-out (ops.notifications).
 *
 * Holds no balances. Inserts are driven by the bus; the inbox row is written
 * first and always, and out-of-app channels are attempted afterwards, against
 * addresses the user confirmed.
 *
 * The invariant this class exists to protect: **the inbox row is the
 * notification; a channel's delivery is a separate, separately recorded fact.**
 * An email that bounced does not un-notify the user in-app, and an in-app row
 * never claims an email went out.
 */

export interface CreateResult {
  /** True only when THIS call wrote the row. False on a redelivery. */
  inserted: boolean;
  /** The row this call wrote. Null on a redelivery — the row already existed. */
  notification: Notification | null;
  /**
   * What happened on each channel. Present even on a redelivery: a crash between
   * the insert and the send is only recoverable if redelivery still fans out.
   */
  dispatch: DispatchReport | null;
}

export type RegisterOutcome =
  | { status: 'sent'; channel: OutOfAppChannel; expiresAt: Date }
  | { status: 'refused'; channel: OutOfAppChannel; code: RefusalCode; expiresAt: Date }
  | { status: 'failed'; channel: OutOfAppChannel; detail: string; expiresAt: Date };

export interface NotifyServiceOptions {
  readonly fanoutEnabled: boolean;
  /** Minutes a confirmation code stays valid. Optional so inbox-only callers stay terse. */
  readonly verifyTtlMinutes?: number;
}

const DEFAULT_VERIFY_TTL_MINUTES = 15;

export interface NotifyServiceDeps {
  readonly targets: TargetStore;
  readonly deliveries: DeliveryStore;
  readonly channels: ChannelRegistry;
  readonly dispatcher: NotificationDispatcher;
}

/** Confirmation codes are compared as hashes, and only ever stored as one. */
function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

/** Six digits from a CSPRNG — not `Math.random`, which is predictable. */
function newCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export class NotifyService {
  constructor(
    private readonly store: NotifyStore,
    private readonly options: NotifyServiceOptions = { fanoutEnabled: true },
    private readonly deps?: NotifyServiceDeps,
  ) {}

  get fanoutEnabled(): boolean {
    return this.options.fanoutEnabled;
  }

  /**
   * Idempotent insert, then fan out.
   *
   * When fan-out is killed, returns inserted:false without writing — consumers
   * still ack the bus message.
   */
  async create(input: InsertNotificationInput): Promise<CreateResult> {
    return withNotifySpan('notify.create', { op: 'create', kind: input.kind, sourceSubject: input.sourceSubject }, async (span) => {
      if (!this.options.fanoutEnabled) {
        span.setAttribute('intafaced.notify.fanout_enabled', false);
        return { inserted: false, notification: null, dispatch: null };
      }
      span.setAttribute('intafaced.notify.fanout_enabled', true);

      const result = await this.store.insert(input);
      span.setAttribute('intafaced.notify.inserted', result.inserted);

      if (!this.deps) return { inserted: result.inserted, notification: result.notification, dispatch: null };

      // On a redelivery the insert is a no-op, so recover the row the FIRST
      // delivery wrote. Without this, a process that died after the insert and
      // before the send would never send: the retry would find nothing to fan
      // out and ack anyway. The delivery table stops the recovered row being
      // sent twice.
      const row = result.notification ?? (await this.store.findBySource(input.userId, input.sourceSubject, input.sourceIdempotencyKey));
      if (!row) return { inserted: result.inserted, notification: result.notification, dispatch: null };

      const dispatch = await this.deps.dispatcher.dispatch(row);
      return { inserted: result.inserted, notification: result.notification, dispatch };
    });
  }

  list(query: ListQuery): Promise<ListResult> {
    return withNotifySpan('notify.list', { op: 'list' }, async (span) => {
      span.setAttribute('intafaced.notify.unread_only', query.unreadOnly);
      span.setAttribute('intafaced.notify.limit', query.limit);
      const result = await this.store.list(query);
      span.setAttribute('intafaced.notify.item_count', result.items.length);
      return result;
    });
  }

  unreadCount(userId: string): Promise<number> {
    return withNotifySpan('notify.unreadCount', { op: 'unreadCount' }, async (span) => {
      const count = await this.store.unreadCount(userId);
      span.setAttribute('intafaced.notify.unread_count', count);
      return count;
    });
  }

  /**
   * Mark specific notifications read. Always scoped to `userId` — foreign ids
   * are silently ignored (self-only; never leaks existence).
   */
  markRead(userId: string, ids: readonly string[]): Promise<number> {
    return withNotifySpan('notify.markRead', { op: 'markRead' }, async (span) => {
      span.setAttribute('intafaced.notify.id_count', ids.length);
      const marked = await this.store.markRead(userId, ids);
      span.setAttribute('intafaced.notify.marked', marked);
      return marked;
    });
  }

  markAllRead(userId: string): Promise<number> {
    return withNotifySpan('notify.markAllRead', { op: 'markAllRead' }, async (span) => {
      const marked = await this.store.markAllRead(userId);
      span.setAttribute('intafaced.notify.marked', marked);
      return marked;
    });
  }

  // ── channels ──────────────────────────────────────────────────────────────

  /**
   * What each channel can actually do right now.
   *
   * Exposed to the user on purpose. Someone who registered a phone number is
   * entitled to know SMS is not wired rather than wondering why nothing arrives,
   * and an operator gets the same answer from `/ready` without reading code.
   */
  channelStatus(): readonly ChannelStatus[] {
    return this.deps?.channels.status() ?? [];
  }

  listTargets(userId: string): Promise<ChannelTarget[]> {
    return withNotifySpan('notify.listTargets', { op: 'listTargets' }, async () => (this.deps ? this.deps.targets.list(userId) : []));
  }

  /**
   * Register an address and send its confirmation code THROUGH THE CHANNEL
   * BEING REGISTERED.
   *
   * That is the design rather than a convenience: proving the address belongs to
   * this user and proving the channel actually works are the same test. If the
   * gateway has no credentials the address is still recorded and the refusal
   * code is returned — the address simply stays unconfirmed and nothing will
   * ever be sent to it. There is no path here that reports success without a
   * transport having accepted something.
   */
  async registerTarget(input: { userId: string; channel: OutOfAppChannel; address: string; locale: string }): Promise<RegisterOutcome> {
    return withNotifySpan('notify.registerTarget', { op: 'registerTarget' }, async (span) => {
      span.setAttribute('intafaced.notify.channel', input.channel);
      if (!this.deps) throw new Error('svc-notify was constructed without channel dependencies');

      const locale = normaliseLocale(input.locale);
      const code = newCode();
      const ttlMinutes = this.options.verifyTtlMinutes ?? DEFAULT_VERIFY_TTL_MINUTES;
      const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);

      await this.deps.targets.upsert({
        userId: input.userId,
        channel: input.channel,
        address: input.address,
        locale,
        verifyTokenHash: hashCode(code),
        verifyExpiresAt: expiresAt,
      });

      const copy = renderVerification(locale, code, ttlMinutes);
      const adapter = this.deps.channels.get(input.channel);

      try {
        await adapter.deliver({
          // Deliberately NOT an inbox row: a code readable by anyone already
          // holding the session would defeat the point of confirming a new
          // address.
          notificationId: `verify:${input.userId}:${input.channel}`,
          userId: input.userId,
          channel: input.channel,
          kind: 'notify.channel.verify',
          severity: 'action',
          titleKey: 'notify.channel.verify.title',
          bodyKey: 'notify.channel.verify.body',
          title: copy.title,
          body: copy.body,
          href: null,
          locale,
          address: input.address,
          idempotencyKey: `verify:${input.userId}:${input.channel}:${expiresAt.getTime()}`,
        });
        span.setAttribute('intafaced.notify.verify_sent', true);
        return { status: 'sent', channel: input.channel, expiresAt };
      } catch (err) {
        span.setAttribute('intafaced.notify.verify_sent', false);
        if (err instanceof ChannelRefusal) return { status: 'refused', channel: input.channel, code: err.code, expiresAt };
        return { status: 'failed', channel: input.channel, detail: err instanceof Error ? err.message : String(err), expiresAt };
      }
    });
  }

  /** Confirm an address. Wrong, expired and already-spent codes are all one answer. */
  async verifyTarget(userId: string, channel: OutOfAppChannel, code: string): Promise<boolean> {
    return withNotifySpan('notify.verifyTarget', { op: 'verifyTarget' }, async (span) => {
      span.setAttribute('intafaced.notify.channel', channel);
      if (!this.deps) return false;
      const verified = await this.deps.targets.markVerified(userId, channel, hashCode(code), new Date());
      span.setAttribute('intafaced.notify.verified', verified);
      return verified;
    });
  }

  removeTarget(userId: string, channel: OutOfAppChannel): Promise<boolean> {
    return withNotifySpan('notify.removeTarget', { op: 'removeTarget' }, async () =>
      this.deps ? this.deps.targets.remove(userId, channel) : false,
    );
  }

  /**
   * What happened to one of the caller's own notifications, per channel.
   *
   * Scoped by loading the notification under the caller's id FIRST, so a
   * delivery record is only ever returned for a row the caller owns. An id
   * belonging to somebody else returns an empty list rather than an error that
   * would confirm it exists.
   */
  async deliveriesFor(userId: string, notificationId: string): Promise<DeliveryRecord[]> {
    return withNotifySpan('notify.deliveries', { op: 'deliveries' }, async () => {
      if (!this.deps) return [];
      const own = await this.store.findById(userId, notificationId);
      if (!own) return [];
      return this.deps.deliveries.listForNotification(notificationId);
    });
  }
}
