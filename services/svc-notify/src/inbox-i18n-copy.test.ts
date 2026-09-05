/**
 * Unit card — in-app inbox copy resolves @intafaced/i18n keys
 * 1. Promise: TRK-infra.i18n slice — inbox titles/bodies go through the catalog
 * 2. Break: unknown key invents English ("Your agent finished") instead of refusing by name
 * 3. Done bar: known keys render catalog copy (no consent footer); unknown keys
 *    return the dotted key; agentActionCompleted stays in-app only
 * 4. Class N
 * 5. Paths: services/svc-notify only (catalog keys already on tip)
 * 6. RED: unknown bodyKey becomes a sentence
 * 7. Collision: none vs packages/contracts / apps/admin
 */

import { describe, expect, it } from 'vitest';
import { MemoryEventBus, agentActionCompleted } from '@intafaced/events';
import { MemoryNotifyStore } from './store.js';
import { MemoryDeliveryStore, MemoryTargetStore } from './channel-store.js';
import { NotifyService } from './notify-service.js';
import { NotificationDispatcher } from './dispatch.js';
import { ChannelRegistry } from './channels/registry.js';
import { InAppChannel, UnconfiguredChannel } from './channels/gateway.js';
import type { NotificationChannel, OutboundMessage } from './channels/channel.js';
import { ChannelDeliveryError } from './channels/channel.js';
import { renderInboxCopy, renderNotification } from './channels/render.js';
import { subscribeNotificationEvents } from './events.js';
import { createNotifyRouter } from './router.js';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';

const USER = '11111111-1111-4111-8111-111111111111';
const SESSION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SECRET = 'a-notify-inbox-i18n-edge-secret-long';

const UNKNOWN_TITLE = 'notify.inbox.not_a_real_key.title';
const UNKNOWN_BODY = 'notify.inbox.not_a_real_key.body';

function row(over: Partial<Parameters<typeof renderInboxCopy>[0]> = {}) {
  return {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    userId: USER,
    kind: 'agents.action.completed',
    titleKey: 'notify.agents.action.completed.title',
    bodyKey: 'notify.agents.action.completed.body',
    params: { kind: 'completion', task: 'chat', tool: '—', sessionId: SESSION, agentId: 'a1', sequence: 0 },
    href: `/agents/sessions/${SESSION}`,
    severity: 'info' as const,
    readAt: null,
    sourceSubject: agentActionCompleted.subject,
    sourceIdempotencyKey: `${SESSION}:0`,
    createdAt: new Date(),
    ...over,
  };
}

class SpyEmail implements NotificationChannel {
  readonly channel = 'email' as const;
  readonly unavailableReason = null;
  readonly sent: OutboundMessage[] = [];
  async deliver(message: OutboundMessage) {
    this.sent.push(message);
    if (message.channel !== 'email') throw new ChannelDeliveryError('email', 'wrong channel', { retryable: false, status: 500 });
    return { reference: 'email-1' };
  }
}

describe('in-app inbox copy — @intafaced/i18n (TRK-infra.i18n slice)', () => {
  it('resolves catalog keys to human copy and does not append the out-of-app footer', () => {
    const copy = renderInboxCopy(row(), 'en');
    expect(copy.title).toBe('Agent action finished');
    expect(copy.body).toBe('Your agent finished (completion).');
    expect(copy.body).not.toContain('confirmed this address');

    const ooa = renderNotification(row(), 'en');
    expect(ooa.body).toContain('confirmed this address');
    expect(copy.body).not.toBe(ooa.body);
  });

  it('refuses an unknown key by name instead of inventing English copy', () => {
    const copy = renderInboxCopy(
      row({
        titleKey: UNKNOWN_TITLE,
        bodyKey: UNKNOWN_BODY,
      }),
      'en',
    );

    expect(copy.title).toBe(UNKNOWN_TITLE);
    expect(copy.body).toBe(UNKNOWN_BODY);
    expect(copy.body).not.toMatch(/Your agent finished/i);
    expect(copy.body).not.toMatch(/Agent action finished/i);
    expect(copy.title).not.toMatch(/ /);
  });

  it('list wire carries resolved title/body for a known key', async () => {
    const store = new MemoryNotifyStore();
    const notify = new NotifyService(store, { fanoutEnabled: true });
    await notify.create({
      userId: USER,
      kind: 'agents.action.completed',
      titleKey: 'notify.agents.action.completed.title',
      bodyKey: 'notify.agents.action.completed.body',
      params: { kind: 'completion' },
      sourceSubject: agentActionCompleted.subject,
      sourceIdempotencyKey: `${SESSION}:0`,
    });

    const edge = createEdgeContext({ secret: SECRET, serviceName: 'svc-notify' });
    const principal = {
      sub: USER,
      userId: USER,
      sid: '22222222-2222-4222-8222-222222222222',
      scopes: ['notify:read'],
      tier: 'none',
      mfa: false,
      expiresAt: new Date(Date.now() + 60_000),
    } as Principal;
    const raw = encodePrincipal(principal);
    const ctx = edge({
      headers: {
        'x-intafaced-principal': raw,
        'x-intafaced-principal-sig': signPrincipalHeader(raw, SECRET, 'DE'),
        'x-intafaced-region': 'DE',
      },
      id: 'req-inbox-i18n',
    });

    const listed = await createNotifyRouter(notify).createCaller(ctx).notify.list({ limit: 20 });
    expect(listed.items).toHaveLength(1);
    expect(listed.items[0]!.titleKey).toBe('notify.agents.action.completed.title');
    expect(listed.items[0]!.title).toBe('Agent action finished');
    expect(listed.items[0]!.body).toBe('Your agent finished (completion).');
    expect(listed.items[0]!.body).not.toContain('confirmed this address');
  });

  it('list wire refuses an unknown body key by name', async () => {
    const store = new MemoryNotifyStore();
    const notify = new NotifyService(store, { fanoutEnabled: true });
    await notify.create({
      userId: USER,
      kind: 'agents.action.completed',
      titleKey: UNKNOWN_TITLE,
      bodyKey: UNKNOWN_BODY,
      sourceSubject: agentActionCompleted.subject,
      sourceIdempotencyKey: `${SESSION}:missing`,
    });

    const edge = createEdgeContext({ secret: SECRET, serviceName: 'svc-notify' });
    const principal = {
      sub: USER,
      userId: USER,
      sid: '22222222-2222-4222-8222-222222222222',
      scopes: ['notify:read'],
      tier: 'none',
      mfa: false,
      expiresAt: new Date(Date.now() + 60_000),
    } as Principal;
    const raw = encodePrincipal(principal);
    const ctx = edge({
      headers: {
        'x-intafaced-principal': raw,
        'x-intafaced-principal-sig': signPrincipalHeader(raw, SECRET, 'DE'),
        'x-intafaced-region': 'DE',
      },
      id: 'req-inbox-missing',
    });

    const listed = await createNotifyRouter(notify).createCaller(ctx).notify.list({ limit: 20 });
    expect(listed.items[0]!.body).toBe(UNKNOWN_BODY);
    expect(listed.items[0]!.title).toBe(UNKNOWN_TITLE);
    expect(listed.items[0]!.body).not.toMatch(/Your agent finished/i);
  });

  it('agentActionCompleted does not fan out email even when a verified mailbox exists', async () => {
    const email = new SpyEmail();
    const store = new MemoryNotifyStore();
    const targets = new MemoryTargetStore();
    const deliveries = new MemoryDeliveryStore();
    const channels = new ChannelRegistry([
      new InAppChannel(),
      email,
      new UnconfiguredChannel('push', ['NOTIFY_PUSH_GATEWAY_URL', 'NOTIFY_PUSH_GATEWAY_TOKEN']),
      new UnconfiguredChannel('sms', ['NOTIFY_SMS_GATEWAY_URL', 'NOTIFY_SMS_GATEWAY_TOKEN']),
    ]);
    const dispatcher = new NotificationDispatcher(channels, targets, deliveries, { maxAttempts: 3, outOfAppEnabled: true });
    const notify = new NotifyService(store, { fanoutEnabled: true }, { targets, deliveries, channels, dispatcher });

    await targets.upsert({
      userId: USER,
      channel: 'email',
      address: 'someone@example.com',
      locale: 'en',
      verifyTokenHash: 'x'.repeat(64),
      verifyExpiresAt: new Date(Date.now() + 60_000),
    });
    await targets.markVerified(USER, 'email', 'x'.repeat(64), new Date());

    const bus = new MemoryEventBus('svc-agents');
    await subscribeNotificationEvents(bus, notify);
    await bus.publish('agentActionCompleted', {
      sessionId: SESSION,
      userId: USER,
      agentId: 'a1',
      sequence: 0,
      kind: 'completion',
      task: 'chat',
      tool: null,
      inputTokens: 1,
      outputTokens: 1,
    });

    expect(email.sent).toHaveLength(0);
    expect(await notify.unreadCount(USER)).toBe(1);
    const rows = await deliveries.listForNotification((await notify.list({ userId: USER, limit: 1, unreadOnly: false })).items[0]!.id);
    expect(rows.map((r) => r.channel).sort()).toEqual(['inapp']);
  });
});
