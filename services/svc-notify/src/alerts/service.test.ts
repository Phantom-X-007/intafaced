/**
 * AlertService — create + dark refuse + cross fires one inbox row.
 */

import { describe, expect, it } from 'vitest';
import { NotifyService } from '../notify-service.js';
import { MemoryNotifyStore } from '../store.js';
import { AlertService } from './service.js';
import { MemoryAlertStore } from './store.js';
import type { MarkQuote, MarkSource } from './types.js';

function harness(mark: MarkQuote) {
  const notifyStore = new MemoryNotifyStore();
  // Inbox-only NotifyService is enough: alerts ride create() for the row;
  // out-of-app dispatch is the same path as every other bus consumer.
  const notify = new NotifyService(notifyStore, { fanoutEnabled: true });
  const marks: MarkSource = {
    // A fake that CAN quote is `live` — `kind` describes the wiring, and a test
    // source answering `{ kind: 'ok' }` while claiming to be dark would be the
    // same lie in the other direction.
    kind: mark.kind === 'ok' ? 'live' : 'dark',
    async quote() {
      return mark;
    },
  };
  const alerts = new AlertService(new MemoryAlertStore(), marks, notify);
  return { alerts, notifyStore };
}

describe('AlertService — rides notify fan-out, refuses dark marks', () => {
  it('creates a watch and lists it self-only', async () => {
    const { alerts } = harness({ kind: 'ok', price: '90', at: new Date() });
    const row = await alerts.create({
      userId: 'u1',
      marketId: 'BTC-USD',
      direction: 'above',
      targetPrice: '100',
    });
    expect(row.status).toBe('active');
    const list = await alerts.list('u1');
    expect(list).toHaveLength(1);
    expect(await alerts.list('u2')).toHaveLength(0);
  });

  it('dark mark refuses every active alert and writes no notification', async () => {
    const { alerts, notifyStore } = harness({ kind: 'unavailable', reason: 'dark' });
    const row = await alerts.create({
      userId: 'u1',
      marketId: 'BTC-USD',
      direction: 'above',
      targetPrice: '100',
    });
    const report = await alerts.evaluateMarket('BTC-USD');
    expect(report.mark).toBeNull();
    expect(report.results).toHaveLength(1);
    expect(report.results[0]).toMatchObject({
      alertId: row.id,
      outcome: { kind: 'refuse', code: 'alert.price_unavailable' },
      notificationId: null,
    });
    // Still active — dark is not a fire.
    expect((await alerts.list('u1'))[0]!.status).toBe('active');
    expect(await notifyStore.unreadCount('u1')).toBe(0);
  });

  it('cross fires once into the inbox and marks the alert fired', async () => {
    const { alerts, notifyStore } = harness({ kind: 'ok', price: '100.5', at: new Date() });
    await alerts.create({
      userId: 'u1',
      marketId: 'BTC-USD',
      direction: 'above',
      targetPrice: '100',
    });
    const report = await alerts.evaluateMarket('BTC-USD');
    expect(report.mark).toBe('100.5');
    expect(report.results[0]!.outcome.kind).toBe('fire');
    expect(report.results[0]!.notificationId).toBeTruthy();

    const inbox = await notifyStore.list({ userId: 'u1', limit: 10, unreadOnly: false });
    expect(inbox.items).toHaveLength(1);
    expect(inbox.items[0]!.kind).toBe('alert.price.crossed');
    expect(inbox.items[0]!.params).toMatchObject({
      marketId: 'BTC-USD',
      targetPrice: '100',
      markPrice: '100.5',
    });
    expect((await alerts.list('u1'))[0]!.status).toBe('fired');

    // Second evaluate does not re-fire (no longer active).
    const again = await alerts.evaluateMarket('BTC-USD');
    expect(again.results).toHaveLength(0);
    expect(await notifyStore.unreadCount('u1')).toBe(1);
  });

  it('hold leaves the alert active and the inbox empty', async () => {
    const { alerts, notifyStore } = harness({ kind: 'ok', price: '99', at: new Date() });
    await alerts.create({
      userId: 'u1',
      marketId: 'BTC-USD',
      direction: 'above',
      targetPrice: '100',
    });
    const report = await alerts.evaluateMarket('BTC-USD');
    expect(report.results[0]!.outcome).toEqual({ kind: 'hold', markPrice: '99' });
    expect(await notifyStore.unreadCount('u1')).toBe(0);
    expect((await alerts.list('u1'))[0]!.status).toBe('active');
  });
});
