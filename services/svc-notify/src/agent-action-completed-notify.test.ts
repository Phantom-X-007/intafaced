/**
 * Unit card — agentActionCompleted inbox
 * 1. Promise: ops.notifications extra consumer — existing svc-agents publisher
 * 2. Break: completion/session_close exist on agent_actions but inbox is silent
 * 3. Done bar: one row per session:sequence for completion/session_close; omitted kinds write nothing
 * 4. Class N
 * 5. Paths: svc-notify + i18n keys + WIRING_SOCKETS close
 * 6. RED: tool_call/embedding → 0 rows; completion → 1 row
 * 7. Collision: none vs #1836 (svc-trade)
 */

import { describe, expect, it } from 'vitest';
import { MemoryEventBus, agentActionCompleted } from '@intafaced/events';
import { MESSAGE_KEYS } from '@intafaced/i18n';
import { MemoryNotifyStore } from './store.js';
import { NotifyService } from './notify-service.js';
import { renderNotification } from './channels/render.js';
import { DEFAULT_AGENT_ACTION_COMPLETED_NOTIFY_POLICY, subscribeNotificationEvents } from './events.js';

const USER = '11111111-1111-4111-8111-111111111111';
const SESSION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function completed(
  overrides: Partial<{
    sequence: number;
    kind: 'session_open' | 'session_close' | 'completion' | 'embedding' | 'tool_call' | 'usage_settlement';
    tool: string | null;
    task: string | null;
  }> = {},
) {
  return {
    sessionId: SESSION,
    userId: USER,
    agentId: 'a1',
    sequence: 0,
    kind: 'completion' as const,
    task: 'chat',
    tool: null,
    inputTokens: 12,
    outputTokens: 34,
    ...overrides,
  };
}

describe('agentActionCompleted inbox (TRK-ops.notifications)', () => {
  it('pins user-visible kinds to completion and session_close', () => {
    expect(DEFAULT_AGENT_ACTION_COMPLETED_NOTIFY_POLICY.kinds).toEqual(['completion', 'session_close']);
    expect(DEFAULT_AGENT_ACTION_COMPLETED_NOTIFY_POLICY.severity).toBe('info');
  });

  it('writes one inbox row for completion and dedupes redelivery', async () => {
    const store = new MemoryNotifyStore();
    const notify = new NotifyService(store, { fanoutEnabled: true });
    const bus = new MemoryEventBus('svc-agents');
    await subscribeNotificationEvents(bus, notify);

    await bus.publish('agentActionCompleted', completed());
    await bus.publish('agentActionCompleted', completed());

    expect(await notify.unreadCount(USER)).toBe(1);
    const rows = await notify.list({ userId: USER, limit: 10, unreadOnly: false });
    const row = rows.items[0]!;
    expect(row.kind).toBe('agents.action.completed');
    expect(row.sourceSubject).toBe(agentActionCompleted.subject);
    expect(row.sourceIdempotencyKey).toBe(`${SESSION}:0`);
    expect(row.titleKey).toBe('notify.agents.action.completed.title');
    expect(row.bodyKey).toBe('notify.agents.action.completed.body');
    expect(row.severity).toBe('info');
    expect(row.href).toBe(`/agents/sessions/${SESSION}`);
    expect(row.params).toMatchObject({ kind: 'completion', task: 'chat' });
  });

  it('writes an inbox row for session_close', async () => {
    const store = new MemoryNotifyStore();
    const notify = new NotifyService(store, { fanoutEnabled: true });
    const bus = new MemoryEventBus('svc-agents');
    await subscribeNotificationEvents(bus, notify);

    await bus.publish('agentActionCompleted', completed({ kind: 'session_close', task: null }));

    expect(await notify.unreadCount(USER)).toBe(1);
    const row = (await notify.list({ userId: USER, limit: 10, unreadOnly: false })).items[0]!;
    expect(row.params).toMatchObject({ kind: 'session_close' });
  });

  it('does not write inbox rows for omitted kinds', async () => {
    const store = new MemoryNotifyStore();
    const notify = new NotifyService(store, { fanoutEnabled: true });
    const bus = new MemoryEventBus('svc-agents');
    await subscribeNotificationEvents(bus, notify);

    await bus.publish('agentActionCompleted', completed({ sequence: 0, kind: 'tool_call', tool: 'place_order' }));
    await bus.publish('agentActionCompleted', completed({ sequence: 1, kind: 'embedding' }));
    await bus.publish('agentActionCompleted', completed({ sequence: 2, kind: 'session_open' }));
    await bus.publish('agentActionCompleted', completed({ sequence: 3, kind: 'usage_settlement' }));

    expect(await notify.unreadCount(USER)).toBe(0);
    const rows = await notify.list({ userId: USER, limit: 10, unreadOnly: false });
    expect(rows.items).toHaveLength(0);
  });

  it('treats a later visible sequence on the same session as a second fact', async () => {
    const store = new MemoryNotifyStore();
    const notify = new NotifyService(store, { fanoutEnabled: true });
    const bus = new MemoryEventBus('svc-agents');
    await subscribeNotificationEvents(bus, notify);

    await bus.publish('agentActionCompleted', completed({ sequence: 0, kind: 'completion' }));
    await bus.publish('agentActionCompleted', completed({ sequence: 1, kind: 'session_close' }));

    expect(await notify.unreadCount(USER)).toBe(2);
  });

  it('catalog keys exist and render human copy without leftover placeholders', () => {
    expect(MESSAGE_KEYS).toContain('notify.agents.action.completed.title');
    expect(MESSAGE_KEYS).toContain('notify.agents.action.completed.body');

    const rendered = renderNotification(
      {
        id: 'n-done',
        userId: USER,
        kind: 'agents.action.completed',
        titleKey: 'notify.agents.action.completed.title',
        bodyKey: 'notify.agents.action.completed.body',
        params: { kind: 'completion', tool: '—', task: 'chat', sessionId: SESSION, agentId: 'a1', sequence: 0 },
        href: `/agents/sessions/${SESSION}`,
        severity: 'info',
        readAt: null,
        sourceSubject: agentActionCompleted.subject,
        sourceIdempotencyKey: `${SESSION}:0`,
        createdAt: new Date(),
      },
      'en',
    );

    expect(rendered.title).toBe('Agent action finished');
    expect(rendered.body).toContain('completion');
    expect(rendered.body).not.toContain('notify.agents');
    expect(rendered.body).not.toContain('{');
  });
});
