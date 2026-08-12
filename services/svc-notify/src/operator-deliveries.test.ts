import { describe, expect, it, vi } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { MemoryDeliveryStore } from './channel-store.js';
import type { NotifyService } from './notify-service.js';
import { createNotifyRouter } from './router.js';

/**
 * D26-P1-O5 — operator delivery outcomes view (residual after #1701).
 *
 * Product door: admin can list recent delivery rows; notify:read cannot.
 */

const SECRET = 'a-notify-operator-deliveries-test-secret-long';
const USER = '11111111-1111-4111-8111-111111111111';
const edgeContext = createEdgeContext({ secret: SECRET, serviceName: 'svc-notify' });

function principal(scopes: string[]): Principal {
  return {
    sub: USER,
    userId: USER,
    sid: '22222222-2222-4222-8222-222222222222',
    scopes,
    tier: 'none',
    mfa: false,
    expiresAt: new Date(Date.now() + 60_000),
  } as Principal;
}

function signed(scopes: string[]) {
  const raw = encodePrincipal(principal(scopes));
  return edgeContext({
    headers: {
      'x-intafaced-principal': raw,
      'x-intafaced-principal-sig': signPrincipalHeader(raw, SECRET, 'DE'),
      'x-intafaced-region': 'DE',
    },
    id: 'req-op',
  });
}

describe('operator delivery outcomes (D26-P1-O5)', () => {
  it('MemoryDeliveryStore.listRecent is newest-first and capped', async () => {
    const n1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const n2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    let nowMs = Date.parse('2026-08-12T12:00:00.000Z');
    const s = new MemoryDeliveryStore({ now: () => new Date(nowMs) });
    const c1 = await s.claim(n1, 'email', 3);
    expect(c1.claimed).toBe(true);
    if (!c1.claimed) throw new Error('expected claim');
    await s.settle({ id: c1.id, attempt: 1, status: 'refused', refusalCode: 'channel.not_configured', attempted: false });
    nowMs = Date.parse('2026-08-12T13:00:00.000Z');
    const c2 = await s.claim(n2, 'inapp', 3);
    expect(c2.claimed).toBe(true);
    if (!c2.claimed) throw new Error('expected claim');
    await s.settle({ id: c2.id, attempt: 1, status: 'accepted', attempted: true });

    const recent = await s.listRecent(10);
    expect(recent).toHaveLength(2);
    expect(recent[0]!.notificationId).toBe(n2);
    expect(recent[0]!.status).toBe('accepted');
    expect(recent[1]!.status).toBe('refused');
    expect(await s.listRecent(1)).toHaveLength(1);
  });

  it('admin:read can call operatorDeliveries; notify:read cannot', async () => {
    const notificationId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const notify = {
      fanoutEnabled: true,
      operatorDeliveryOutcomes: vi.fn(async () => [
        {
          id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          notificationId,
          channel: 'inapp' as const,
          status: 'accepted' as const,
          attempts: 1,
          attemptedAt: new Date('2026-08-12T12:00:00.000Z'),
          acceptedAt: new Date('2026-08-12T12:00:00.000Z'),
          leaseUntil: null,
          refusalCode: null,
          detail: null,
          reference: null,
          createdAt: new Date('2026-08-12T12:00:00.000Z'),
          updatedAt: new Date('2026-08-12T12:00:01.000Z'),
        },
      ]),
    } as unknown as NotifyService;

    const router = createNotifyRouter(notify);
    const asAdmin = await router.createCaller(signed(['admin:read'])).notify.operatorDeliveries({ limit: 10 });
    expect(asAdmin).toHaveLength(1);
    expect(asAdmin[0]).toMatchObject({
      notificationId,
      channel: 'inapp',
      status: 'accepted',
    });
    expect(notify.operatorDeliveryOutcomes).toHaveBeenCalledWith(10);

    await expect(router.createCaller(signed(['notify:read'])).notify.operatorDeliveries()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});
