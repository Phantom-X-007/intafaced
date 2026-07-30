import type {
  InsertNotificationInput,
  ListQuery,
  ListResult,
  Notification,
  NotifyStore,
} from './store.js';

/**
 * svc-notify — in-app inbox (ops.notifications).
 *
 * Holds no balances. Inserts are driven by the bus (fillSettled, p2p escrow
 * lifecycle, kycApproved, rankUpdated, stakeCreated). Push / email / SMS are
 * §13 sockets — this service never opens those channels.
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
    if (!this.options.fanoutEnabled) {
      return { inserted: false, notification: null };
    }
    return this.store.insert(input);
  }

  list(query: ListQuery): Promise<ListResult> {
    return this.store.list(query);
  }

  unreadCount(userId: string): Promise<number> {
    return this.store.unreadCount(userId);
  }

  /**
   * Mark specific notifications read. Always scoped to `userId` — foreign ids
   * are silently ignored (self-only; never leaks existence).
   */
  markRead(userId: string, ids: readonly string[]): Promise<number> {
    return this.store.markRead(userId, ids);
  }

  markAllRead(userId: string): Promise<number> {
    return this.store.markAllRead(userId);
  }
}
