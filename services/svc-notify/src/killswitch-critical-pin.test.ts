/**
 * Unit card — kill-switch critical still writes refusal rows
 * 1. Promise: README Kill-switches — out-of-app off refuses channel.disabled;
 *    critical still records a row even when no target exists
 * 2. Break: kill-switch + no address → silence on margin call (liability hole)
 * 3. Done bar: critical + outOfAppEnabled false + no targets → every out-of-app
 *    channel has refused channel.disabled
 * 4. Class N
 * 5. Paths: svc-notify tests (pin on existing dispatch law)
 * 6. RED: expect disabled rows, not empty deliveries
 * 7. Collision: none
 */

import { describe, expect, it } from 'vitest';
import { MemoryDeliveryStore, MemoryTargetStore } from './channel-store.js';
import { InAppChannel, UnconfiguredChannel } from './channels/gateway.js';
import { ChannelRegistry } from './channels/registry.js';
import { NotificationDispatcher } from './dispatch.js';
import { NotifyService } from './notify-service.js';
import { MemoryNotifyStore } from './store.js';

function criticalHarness() {
  const store = new MemoryNotifyStore();
  const targets = new MemoryTargetStore();
  const deliveries = new MemoryDeliveryStore();
  const channels = new ChannelRegistry([
    new InAppChannel(),
    new UnconfiguredChannel('email', ['NOTIFY_EMAIL_GATEWAY_URL', 'NOTIFY_EMAIL_GATEWAY_TOKEN']),
    new UnconfiguredChannel('push', ['NOTIFY_PUSH_GATEWAY_URL', 'NOTIFY_PUSH_GATEWAY_TOKEN']),
    new UnconfiguredChannel('sms', ['NOTIFY_SMS_GATEWAY_URL', 'NOTIFY_SMS_GATEWAY_TOKEN']),
  ]);
  const dispatcher = new NotificationDispatcher(channels, targets, deliveries, {
    maxAttempts: 3,
    outOfAppEnabled: false,
  });
  const notify = new NotifyService(store, { fanoutEnabled: true }, { targets, deliveries, channels, dispatcher });
  return { notify, deliveries };
}

describe('kill-switch — critical still leaves a record', () => {
  it('writes channel.disabled on every out-of-app channel for a critical with no targets', async () => {
    const { notify, deliveries } = criticalHarness();
    const created = await notify.create({
      userId: 'u-margin',
      kind: 'bank.margin_call',
      titleKey: 'notify.bank.margin_call.title',
      bodyKey: 'notify.bank.margin_call.body',
      params: { loanId: 'loan-1' },
      severity: 'critical',
      sourceSubject: 'intafaced.bank.margin_call.created',
      sourceIdempotencyKey: 'loan-1:1',
    });
    expect(created.notification).toBeTruthy();
    const rows = await deliveries.listForNotification(created.notification!.id);
    const outOfApp = rows.filter((r) => r.channel !== 'inapp');
    expect(outOfApp.length).toBe(3);
    for (const row of outOfApp) {
      expect(row).toMatchObject({ status: 'refused', refusalCode: 'channel.disabled' });
    }
  });
});
