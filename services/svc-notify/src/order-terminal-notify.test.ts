/**
 * Unit card — orderUpdated terminal inbox
 * 1. Promise: ops.notifications extra consumer — existing orderUpdated publisher
 * 2. Break: inbox silent on cancel/reject/expire while WS already fans the row
 * 3. Done bar: those three write; pending/open/filled ack; redelivery dedupes; catalog keys render
 * 4. Class N
 * 5. Paths: svc-notify + i18n keys
 * 6. RED: open publishes 0 rows; cancelled publishes 1
 * 7. Collision: none vs #1827/#1828
 */

import { describe, expect, it } from 'vitest';
import { MemoryEventBus, orderUpdated } from '@intafaced/events';
import { MESSAGE_KEYS } from '@intafaced/i18n';
import { MemoryNotifyStore } from './store.js';
import { NotifyService } from './notify-service.js';
import { renderNotification } from './channels/render.js';
import { subscribeNotificationEvents } from './events.js';

const USER = '11111111-1111-4111-8111-111111111111';
const ORDER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function order(overrides: Partial<{ status: 'pending' | 'open' | 'filled' | 'cancelled' | 'rejected' | 'expired' }> = {}) {
  return {
    orderId: ORDER,
    userId: USER,
    marketId: 'BTC-USD',
    status: 'cancelled' as const,
    side: 'buy' as const,
    type: 'limit' as const,
    qty: '1',
    filledQty: '0',
    price: '64000',
    clientOrderId: null,
    ts: new Date().toISOString(),
    ...overrides,
  };
}

describe('orderUpdated terminal inbox (TRK-ops.notifications)', () => {
  it('writes one inbox row on cancelled and dedupes redelivery', async () => {
    const store = new MemoryNotifyStore();
    const notify = new NotifyService(store, { fanoutEnabled: true });
    const bus = new MemoryEventBus('svc-trade');
    await subscribeNotificationEvents(bus, notify);

    await bus.publish('orderUpdated', order());
    await bus.publish('orderUpdated', order());

    expect(await notify.unreadCount(USER)).toBe(1);
    const rows = await notify.list({ userId: USER, limit: 10, unreadOnly: false });
    const row = rows.items[0]!;
    expect(row.kind).toBe('trade.order.terminal');
    expect(row.sourceSubject).toBe(orderUpdated.subject);
    expect(row.sourceIdempotencyKey).toBe(`${ORDER}:cancelled`);
    expect(row.titleKey).toBe('notify.trade.order.terminal.title');
    expect(row.bodyKey).toBe('notify.trade.order.terminal.body');
    expect(row.severity).toBe('info');
  });

  it('writes rejected and expired as distinct keys of the same order', async () => {
    const store = new MemoryNotifyStore();
    const notify = new NotifyService(store, { fanoutEnabled: true });
    const bus = new MemoryEventBus('svc-trade');
    await subscribeNotificationEvents(bus, notify);

    await bus.publish('orderUpdated', order({ status: 'rejected' }));
    await bus.publish('orderUpdated', order({ status: 'expired' }));

    expect(await notify.unreadCount(USER)).toBe(2);
  });

  it('acks pending/open/filled without writing — fills already have fillSettled', async () => {
    const store = new MemoryNotifyStore();
    const notify = new NotifyService(store, { fanoutEnabled: true });
    const bus = new MemoryEventBus('svc-trade');
    await subscribeNotificationEvents(bus, notify);

    for (const status of ['pending', 'open', 'filled'] as const) {
      await bus.publish('orderUpdated', order({ status }));
    }

    expect(await notify.unreadCount(USER)).toBe(0);
  });

  it('catalog keys exist and render human copy', () => {
    expect(MESSAGE_KEYS).toContain('notify.trade.order.terminal.title');
    expect(MESSAGE_KEYS).toContain('notify.trade.order.terminal.body');

    const rendered = renderNotification(
      {
        id: 'n-ord',
        userId: USER,
        kind: 'trade.order.terminal',
        titleKey: 'notify.trade.order.terminal.title',
        bodyKey: 'notify.trade.order.terminal.body',
        params: { side: 'buy', qty: '1', marketId: 'BTC-USD', status: 'cancelled' },
        href: null,
        severity: 'info',
        readAt: null,
        sourceSubject: orderUpdated.subject,
        sourceIdempotencyKey: `${ORDER}:cancelled`,
        createdAt: new Date(),
      },
      'en',
    );

    expect(rendered.title).toBe('Order cancelled');
    expect(rendered.body).toContain('BTC-USD');
    expect(rendered.body).not.toContain('notify.trade');
    expect(rendered.body).not.toContain('{');
  });
});
