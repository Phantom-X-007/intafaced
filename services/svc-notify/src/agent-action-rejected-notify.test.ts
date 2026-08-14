/**
 * Unit card — agentActionRejected inbox
 * 1. Promise: ops.notifications extra consumer — existing svc-agents publisher
 * 2. Break: guardrail refusal is in agent_actions but inbox is silent
 * 3. Done bar: one row per session:sequence; redelivery dedupes; catalog keys render
 * 4. Class N
 * 5. Paths: svc-notify + i18n keys + WIRING_SOCKETS close
 * 6. RED: no attach → 0 rows; attach → 1 row
 * 7. Collision: none vs #1831/#1832 (svc-trade)
 */

import { describe, expect, it } from 'vitest';
import { MemoryEventBus, agentActionRejected } from '@intafaced/events';
import { MESSAGE_KEYS } from '@intafaced/i18n';
import { MemoryNotifyStore } from './store.js';
import { NotifyService } from './notify-service.js';
import { renderNotification } from './channels/render.js';
import { subscribeNotificationEvents } from './events.js';

const USER = '11111111-1111-4111-8111-111111111111';
const SESSION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function rejected(overrides: Partial<{ sequence: number; tool: string | null; refusalCode: string }> = {}) {
  return {
    sessionId: SESSION,
    userId: USER,
    agentId: 'a1',
    sequence: 0,
    refusalCode: 'agents.tool_not_declared',
    tool: 'place_order',
    task: null,
    ...overrides,
  };
}

describe('agentActionRejected inbox (TRK-ops.notifications)', () => {
  it('writes one inbox row and dedupes redelivery', async () => {
    const store = new MemoryNotifyStore();
    const notify = new NotifyService(store, { fanoutEnabled: true });
    const bus = new MemoryEventBus('svc-agents');
    await subscribeNotificationEvents(bus, notify);

    await bus.publish('agentActionRejected', rejected());
    await bus.publish('agentActionRejected', rejected());

    expect(await notify.unreadCount(USER)).toBe(1);
    const rows = await notify.list({ userId: USER, limit: 10, unreadOnly: false });
    const row = rows.items[0]!;
    expect(row.kind).toBe('agents.action.rejected');
    expect(row.sourceSubject).toBe(agentActionRejected.subject);
    expect(row.sourceIdempotencyKey).toBe(`${SESSION}:0`);
    expect(row.titleKey).toBe('notify.agents.action.rejected.title');
    expect(row.bodyKey).toBe('notify.agents.action.rejected.body');
    expect(row.severity).toBe('action');
    expect(row.href).toBe(`/agents/sessions/${SESSION}`);
  });

  it('treats a later sequence on the same session as a second fact', async () => {
    const store = new MemoryNotifyStore();
    const notify = new NotifyService(store, { fanoutEnabled: true });
    const bus = new MemoryEventBus('svc-agents');
    await subscribeNotificationEvents(bus, notify);

    await bus.publish('agentActionRejected', rejected({ sequence: 0 }));
    await bus.publish('agentActionRejected', rejected({ sequence: 1 }));

    expect(await notify.unreadCount(USER)).toBe(2);
  });

  it('catalog keys exist and render human copy without leftover placeholders', () => {
    expect(MESSAGE_KEYS).toContain('notify.agents.action.rejected.title');
    expect(MESSAGE_KEYS).toContain('notify.agents.action.rejected.body');

    const rendered = renderNotification(
      {
        id: 'n-rej',
        userId: USER,
        kind: 'agents.action.rejected',
        titleKey: 'notify.agents.action.rejected.title',
        bodyKey: 'notify.agents.action.rejected.body',
        params: { tool: 'place_order', refusalCode: 'agents.tool_not_declared', task: '—', sessionId: SESSION, agentId: 'a1' },
        href: `/agents/sessions/${SESSION}`,
        severity: 'action',
        readAt: null,
        sourceSubject: agentActionRejected.subject,
        sourceIdempotencyKey: `${SESSION}:0`,
        createdAt: new Date(),
      },
      'en',
    );

    expect(rendered.title).toBe('Agent action refused');
    expect(rendered.body).toContain('place_order');
    expect(rendered.body).toContain('agents.tool_not_declared');
    expect(rendered.body).not.toContain('notify.agents');
    expect(rendered.body).not.toContain('{');
  });
});
