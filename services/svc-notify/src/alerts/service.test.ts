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

describe('AlertService — fire only when the inbox can receive it', () => {
  /**
   * Unit card — markFired-before-notify burns the watch under kill / crash
   * 1. Promise: README price alerts — cross marks fired AND inserts one
   *    notification; fan-out kill writes nothing (fanout-off-pin); notify.create
   *    recovers crash-after-insert by re-fanning (notify-service.ts)
   * 2. Break: evaluateMarket called markFired then fireNotification — under
   *    NOTIFY_FANOUT_ENABLED=false create is a pure no-op AFTER status is
   *    already fired → user sees fired + empty inbox, one-shot never retries.
   *    Same if create throws after mark.
   * 3. Done bar: fire notification first; markFired only when an inbox row
   *    exists or was recovered (dispatch/notification); fanout-off leaves active
   * 4. Class N
   * 5. Paths: services/svc-notify/src/alerts/**
   * 6. RED: this suite
   * 7. Collision: none on wall
   */
  it('fan-out kill leaves a crossed watch active with an empty inbox', async () => {
    const notifyStore = new MemoryNotifyStore();
    const notify = new NotifyService(notifyStore, { fanoutEnabled: false });
    const marks: MarkSource = {
      kind: 'live',
      async quote() {
        return { kind: 'ok', price: '100.5', at: new Date() };
      },
    };
    const alerts = new AlertService(new MemoryAlertStore(), marks, notify);
    await alerts.create({
      userId: 'u1',
      marketId: 'BTC-USD',
      direction: 'above',
      targetPrice: '100',
    });

    const report = await alerts.evaluateMarket('BTC-USD');
    expect(report.results[0]!.outcome.kind).toBe('fire');
    expect(report.results[0]!.notificationId).toBeNull();
    // Must still be active so a later pass (fan-out back on) can deliver.
    expect((await alerts.list('u1'))[0]!.status).toBe('active');
    expect(await notifyStore.unreadCount('u1')).toBe(0);
  });

  it('create throw leaves the watch active so the next sweep can retry', async () => {
    const notifyStore = new MemoryNotifyStore();
    const notify = {
      create: async () => {
        throw new Error('simulated crash mid-fire');
      },
    } as unknown as NotifyService;
    const marks: MarkSource = {
      kind: 'live',
      async quote() {
        return { kind: 'ok', price: '100.5', at: new Date() };
      },
    };
    const alerts = new AlertService(new MemoryAlertStore(), marks, notify);
    await alerts.create({
      userId: 'u1',
      marketId: 'BTC-USD',
      direction: 'above',
      targetPrice: '100',
    });

    await expect(alerts.evaluateMarket('BTC-USD')).rejects.toThrow(/simulated crash/);
    expect((await alerts.list('u1'))[0]!.status).toBe('active');
    expect(await notifyStore.unreadCount('u1')).toBe(0);
  });

  it('when fan-out returns, a previously crossed watch still fires once', async () => {
    const notifyStore = new MemoryNotifyStore();
    const alertStore = new MemoryAlertStore();
    const marks: MarkSource = {
      kind: 'live',
      async quote() {
        return { kind: 'ok', price: '100.5', at: new Date() };
      },
    };
    const alertsKilled = new AlertService(alertStore, marks, new NotifyService(notifyStore, { fanoutEnabled: false }));
    await alertsKilled.create({
      userId: 'u1',
      marketId: 'BTC-USD',
      direction: 'above',
      targetPrice: '100',
    });
    await alertsKilled.evaluateMarket('BTC-USD');
    expect((await alertsKilled.list('u1'))[0]!.status).toBe('active');
    expect(await notifyStore.unreadCount('u1')).toBe(0);

    // Same watch store, fan-out re-enabled — the blocked cross must still land once.
    const alertsLive = new AlertService(alertStore, marks, new NotifyService(notifyStore, { fanoutEnabled: true }));
    const report = await alertsLive.evaluateMarket('BTC-USD');
    expect(report.results[0]!.outcome.kind).toBe('fire');
    expect(report.results[0]!.notificationId).toBeTruthy();
    expect((await alertsLive.list('u1'))[0]!.status).toBe('fired');
    expect(await notifyStore.unreadCount('u1')).toBe(1);

    // One-shot holds after recovery.
    const again = await alertsLive.evaluateMarket('BTC-USD');
    expect(again.results).toHaveLength(0);
    expect(await notifyStore.unreadCount('u1')).toBe(1);
  });
});
