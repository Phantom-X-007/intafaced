import { describe, expect, it } from 'vitest';
import { InAppChannel, UnconfiguredChannel } from './channels/gateway.js';
import { ChannelRegistry } from './channels/registry.js';
import { MemoryDeliveryStore, MemoryTargetStore } from './channel-store.js';
import { NotificationDispatcher } from './dispatch.js';
import type { Notification } from './store.js';

/**
 * A lease held by another replica must NOT end the message.
 *
 * `events.ts` naks only when some outcome is retryable, and an ack is final —
 * there is no sweeper over `notify.deliveries`. So an in-flight outcome that
 * reports `retryable: false` acks a margin call whose lease holder may have
 * crashed, leaving the row `pending` forever with nothing left to reclaim it.
 */

const USER = 'user-1';

function registry(): ChannelRegistry {
  return new ChannelRegistry([
    new InAppChannel(),
    new UnconfiguredChannel('email', ['NOTIFY_EMAIL_GATEWAY_URL', 'NOTIFY_EMAIL_GATEWAY_TOKEN']),
    new UnconfiguredChannel('push', ['NOTIFY_PUSH_GATEWAY_URL', 'NOTIFY_PUSH_GATEWAY_TOKEN']),
    new UnconfiguredChannel('sms', ['NOTIFY_SMS_GATEWAY_URL', 'NOTIFY_SMS_GATEWAY_TOKEN']),
  ]);
}

function notification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    userId: USER,
    kind: 'bank.margin_call',
    severity: 'critical',
    titleKey: 'notify.bank.margin_call.title',
    bodyKey: 'notify.bank.margin_call.body',
    params: {},
    href: null,
    readAt: null,
    sourceSubject: 'intafaced.bank.margin_call.created',
    sourceIdempotencyKey: 'loan-1:1',
    createdAt: new Date(),
    ...overrides,
  } as Notification;
}

function dispatcherOver(deliveries: MemoryDeliveryStore): NotificationDispatcher {
  return new NotificationDispatcher(registry(), new MemoryTargetStore(), deliveries, {
    maxAttempts: 3,
    outOfAppEnabled: true,
  });
}

describe('a lease held by another replica keeps the message alive', () => {
  it('asks for a redelivery instead of acking the message away', async () => {
    const deliveries = new MemoryDeliveryStore({ leaseMs: 60_000 });
    const note = notification();

    // Replica A owns the in-app send and has not settled — it may have crashed.
    const held = await deliveries.claim(note.id, 'inapp', 3);
    expect(held.claimed).toBe(true);

    // Replica B gets the redelivery.
    const report = await dispatcherOver(deliveries).dispatch(note);

    const inapp = report.outcomes.find((o) => o.channel === 'inapp');
    expect(inapp).toMatchObject({ status: 'failed', detail: 'delivery claim held by another worker' });
    // This is the whole point: `events.ts` naks on `report.retry`, and an ack is
    // final. False here loses the notification when the lease holder is dead.
    expect(inapp?.retryable).toBe(true);
    expect(report.retry).toBe(true);
  });

  it('does not burn an attempt on the blocked pass', async () => {
    const deliveries = new MemoryDeliveryStore({ leaseMs: 60_000 });
    const note = notification();

    const held = await deliveries.claim(note.id, 'inapp', 3);
    expect(held.claimed).toBe(true);

    await dispatcherOver(deliveries).dispatch(note);

    const rows = await deliveries.listForNotification(note.id);
    // Still 1. A blocked claim that spent an attempt would abandon a margin call
    // after a few racing replicas.
    expect(rows.find((r) => r.channel === 'inapp')?.attempts).toBe(1);
  });

  it('sends nothing twice — a settled accept still blocks the retry pass', async () => {
    const deliveries = new MemoryDeliveryStore({ leaseMs: 60_000 });
    const note = notification();

    const held = await deliveries.claim(note.id, 'inapp', 3);
    expect(held.claimed).toBe(true);
    if (!held.claimed) return;
    await deliveries.settle({ id: held.id, status: 'accepted', attempted: true, reference: 'inapp-1' });

    const report = await dispatcherOver(deliveries).dispatch(note);

    expect(report.outcomes.find((o) => o.channel === 'inapp')).toMatchObject({
      status: 'already_accepted',
      retryable: false,
    });
    expect(report.retry).toBe(false);
  });

  it('reclaims and sends once the lease has expired — the crash path', async () => {
    let nowMs = 1_000_000;
    const deliveries = new MemoryDeliveryStore({ leaseMs: 10_000, now: () => new Date(nowMs) });
    const note = notification();

    // A claims and dies without settling.
    expect((await deliveries.claim(note.id, 'inapp', 3)).claimed).toBe(true);

    nowMs += 10_001;
    const report = await dispatcherOver(deliveries).dispatch(note);

    expect(report.outcomes.find((o) => o.channel === 'inapp')).toMatchObject({ status: 'accepted' });
  });
});
