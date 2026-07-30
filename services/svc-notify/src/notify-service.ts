import type {
  InsertNotificationInput,
  ListQuery,
  ListResult,
  Notification,
  NotifyStore,
} from './store.js';
import { withNotifySpan } from './tracing.js';

/**
 * svc-notify — in-app inbox (ops.notifications).
 *
 * Holds no balances. Inserts are driven by the bus (fillSettled, p2p escrow
 * lifecycle, p2pTradeDisputed, kycApproved, rankUpdated, stakeCreated). Push /
 * email / SMS are §13 sockets — this service never opens those channels.
 */

export class NotifyService {
  constructor(
    private readonly store: NotifyStore,
    private readonly options: { fanoutEnabled: boolean } = { fanoutEnabled: true },
  ) {}

  get fanoutEnabled(): boolean {
    return this.options.fanoutEnabled;
  }

  /**
   * Idempotent insert. When fan-out is killed, returns inserted:false without
   * writing — consumers still ack the bus message.
   */
  async create(input: InsertNotificationInput): Promise<{ inserted: boolean; notification: Notification | null }> {
    return withNotifySpan(
      'notify.create',
      { op: 'create', kind: input.kind, sourceSubject: input.sourceSubject },
      async (span) => {
        if (!this.options.fanoutEnabled) {
          span.setAttribute('intafaced.notify.fanout_enabled', false);
          return { inserted: false, notification: null };
        }
        span.setAttribute('intafaced.notify.fanout_enabled', true);
        const result = await this.store.insert(input);
        span.setAttribute('intafaced.notify.inserted', result.inserted);
        return result;
      },
    );
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
}
