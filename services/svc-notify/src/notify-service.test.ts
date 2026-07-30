import { describe, expect, it, beforeEach } from 'vitest';
import { MemoryEventBus, fillSettled, kycApproved, p2pEscrowLocked } from '@intafaced/events';
import { MemoryNotifyStore } from './store.js';
import { NotifyService } from './notify-service.js';
import { subscribeNotificationEvents } from './events.js';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const BUYER = '33333333-3333-4333-8333-333333333333';

function baseInsert(overrides: Partial<Parameters<NotifyService['create']>[0]> = {}) {
  return {
    userId: USER,
    kind: 'test',
    titleKey: 'notify.test.title',
    bodyKey: 'notify.test.body',
    sourceSubject: 'intafaced.trade.fill.settled',
    sourceIdempotencyKey: 'fill-1',
    ...overrides,
  };
}

describe('NotifyService — dedupe + self-only mark', () => {
  let store: MemoryNotifyStore;
  let notify: NotifyService;

  beforeEach(() => {
    store = new MemoryNotifyStore();
    notify = new NotifyService(store, { fanoutEnabled: true });
  });

  it('inserts a row once and ignores a second write with the same natural key', async () => {
    const first = await notify.create(baseInsert());
    expect(first.inserted).toBe(true);
    expect(first.notification?.id).toBeTruthy();

    const second = await notify.create(baseInsert());
    expect(second.inserted).toBe(false);
    expect(second.notification).toBeNull();

    const list = await notify.list({ userId: USER, limit: 10, unreadOnly: false });
    expect(list.items).toHaveLength(1);
  });

  it('allows the same source key for a different user', async () => {
    await notify.create(baseInsert({ userId: USER }));
    const other = await notify.create(baseInsert({ userId: OTHER }));
    expect(other.inserted).toBe(true);
  });

  it('skips inserts when fan-out is killed', async () => {
    const killed = new NotifyService(store, { fanoutEnabled: false });
    const result = await killed.create(baseInsert());
    expect(result.inserted).toBe(false);
    expect(await notify.unreadCount(USER)).toBe(0);
  });

  it('markRead only affects the principal rows — foreign ids are ignored', async () => {
    const mine = await notify.create(baseInsert({ sourceIdempotencyKey: 'a' }));
    const theirs = await notify.create(baseInsert({ userId: OTHER, sourceIdempotencyKey: 'b' }));

    const marked = await notify.markRead(USER, [mine.notification!.id, theirs.notification!.id]);
    expect(marked).toBe(1);

    expect(await notify.unreadCount(USER)).toBe(0);
    expect(await notify.unreadCount(OTHER)).toBe(1);
  });

  it('markAllRead is self-only', async () => {
    await notify.create(baseInsert({ sourceIdempotencyKey: 'a' }));
    await notify.create(baseInsert({ sourceIdempotencyKey: 'b' }));
    await notify.create(baseInsert({ userId: OTHER, sourceIdempotencyKey: 'c' }));

    const marked = await notify.markAllRead(USER);
    expect(marked).toBe(2);
    expect(await notify.unreadCount(USER)).toBe(0);
    expect(await notify.unreadCount(OTHER)).toBe(1);
  });

  it('list filters unreadOnly and paginates by cursor', async () => {
    for (let i = 0; i < 5; i++) {
      await notify.create(baseInsert({ sourceIdempotencyKey: `k${i}` }));
    }
    const first = await notify.list({ userId: USER, limit: 2, unreadOnly: false });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toBeTruthy();

    const second = await notify.list({
      userId: USER,
      limit: 2,
      unreadOnly: false,
      cursor: first.nextCursor!,
    });
    expect(second.items).toHaveLength(2);
    expect(second.items[0]!.id).not.toBe(first.items[0]!.id);

    await notify.markAllRead(USER);
    const unread = await notify.list({ userId: USER, limit: 10, unreadOnly: true });
    expect(unread.items).toHaveLength(0);
  });
});

describe('event fan-out', () => {
  it('writes inbox rows from fillSettled / p2pEscrowLocked / kycApproved and dedupes redelivery', async () => {
    const store = new MemoryNotifyStore();
    const notify = new NotifyService(store, { fanoutEnabled: true });
    const bus = new MemoryEventBus('test-producer');
    await subscribeNotificationEvents(bus, notify);

    const fillId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    await bus.publish('fillSettled', {
      fillId,
      orderId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      userId: USER,
      marketId: 'BTC-USD',
      side: 'buy',
      liquidity: 'taker',
      price: '100',
      qty: '0.5',
      quoteAmount: '50',
      feeAsset: 'USD',
      feeAmount: '0.05',
      feeBps: 10,
      sequence: 1,
      ts: new Date().toISOString(),
    });
    // Redelivery
    await bus.publish('fillSettled', {
      fillId,
      orderId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      userId: USER,
      marketId: 'BTC-USD',
      side: 'buy',
      liquidity: 'taker',
      price: '100',
      qty: '0.5',
      quoteAmount: '50',
      feeAsset: 'USD',
      feeAmount: '0.05',
      feeBps: 10,
      sequence: 1,
      ts: new Date().toISOString(),
    });

    expect(await notify.unreadCount(USER)).toBe(1);
    const fills = await notify.list({ userId: USER, limit: 10, unreadOnly: false });
    expect(fills.items[0]!.sourceSubject).toBe(fillSettled.subject);
    expect(fills.items[0]!.sourceIdempotencyKey).toBe(fillId);

    const tradeId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    await bus.publish('p2pEscrowLocked', {
      tradeId,
      offerId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      sellerId: USER,
      buyerId: BUYER,
      asset: 'BTC',
      amount: '1',
      fiatCurrency: 'USD',
      fiatAmount: '50000',
      paymentDeadline: new Date(Date.now() + 3_600_000).toISOString(),
    });
    expect(await notify.unreadCount(USER)).toBe(2);
    expect(await notify.unreadCount(BUYER)).toBe(1);
    expect(p2pEscrowLocked.subject).toContain('p2p');

    await bus.publish('kycApproved', {
      userId: USER,
      tier: 'basic',
      jurisdiction: 'DE',
    });
    expect(await notify.unreadCount(USER)).toBe(3);
    expect(kycApproved.subject).toContain('identity');
  });

  it('acks bus events without writing when fan-out is off', async () => {
    const store = new MemoryNotifyStore();
    const notify = new NotifyService(store, { fanoutEnabled: false });
    const bus = new MemoryEventBus('test-producer');
    await subscribeNotificationEvents(bus, notify);

    await bus.publish('kycApproved', {
      userId: USER,
      tier: 'full',
      jurisdiction: 'GB',
    });
    expect(await notify.unreadCount(USER)).toBe(0);
  });
});
