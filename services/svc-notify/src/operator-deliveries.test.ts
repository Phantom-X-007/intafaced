import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { MemoryNotifyStore } from './store.js';
import { MemoryDeliveryStore, MemoryTargetStore } from './channel-store.js';
import { NotifyService } from './notify-service.js';
import { NotificationDispatcher } from './dispatch.js';
import { ChannelRegistry } from './channels/registry.js';
import { InAppChannel, UnconfiguredChannel } from './channels/gateway.js';
import { MemoryMuteStore } from './preferences/mute.js';
import { createNotifyRouter } from './router.js';

/**
 * Operator delivery outcomes — product path (not a mocked NotifyService).
 *
 * Done-bar: in-app accepted is readable; email without a gateway is
 * `channel.not_configured` (never fake sent / never `delivered`); callers
 * without `admin:read` are refused. Scope stays `admin:read` (existing operator
 * scope) — `notify:ops` would require packages/auth, which this slice does not
 * touch. Digest helpers stay unwired.
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

const anonymous = () => edgeContext({ headers: { 'x-intafaced-region': 'DE' }, id: 'req-anon' });

function productHarness() {
  const store = new MemoryNotifyStore();
  const targets = new MemoryTargetStore();
  const deliveries = new MemoryDeliveryStore();
  const muteStore = new MemoryMuteStore();
  const channels = new ChannelRegistry([
    new InAppChannel(),
    new UnconfiguredChannel('email', ['NOTIFY_EMAIL_GATEWAY_URL', 'NOTIFY_EMAIL_GATEWAY_TOKEN']),
    new UnconfiguredChannel('push', ['NOTIFY_PUSH_GATEWAY_URL', 'NOTIFY_PUSH_GATEWAY_TOKEN']),
    new UnconfiguredChannel('sms', ['NOTIFY_SMS_GATEWAY_URL', 'NOTIFY_SMS_GATEWAY_TOKEN']),
  ]);
  const dispatcher = new NotificationDispatcher(channels, targets, deliveries, {
    maxAttempts: 3,
    outOfAppEnabled: true,
    mutePrefsOf: (userId) => muteStore.get(userId),
  });
  const notify = new NotifyService(
    store,
    { fanoutEnabled: true, verifyTtlMinutes: 15 },
    { targets, deliveries, channels, dispatcher, muteStore },
  );
  return { notify, targets, deliveries };
}

async function confirmEmail(targets: MemoryTargetStore) {
  await targets.upsert({
    userId: USER,
    channel: 'email',
    address: 'ops-view@example.com',
    locale: 'en',
    verifyTokenHash: 'x'.repeat(64),
    verifyExpiresAt: new Date(Date.now() + 60_000),
  });
  await targets.markVerified(USER, 'email', 'x'.repeat(64), new Date());
}

describe('operator delivery outcomes (ops.notifications residual)', () => {
  it('MemoryDeliveryStore.listRecent is newest-first and capped', async () => {
    const n1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const n2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    let nowMs = Date.parse('2026-08-12T12:00:00.000Z');
    const s = new MemoryDeliveryStore({ now: () => new Date(nowMs) });
    const c1 = await s.claim(n1, 'email', 3);
    expect(c1.claimed).toBe(true);
    if (!c1.claimed) throw new Error('expected claim');
    await s.settle({
      id: c1.id,
      attempt: 1,
      status: 'refused',
      refusalCode: 'channel.not_configured',
      attempted: false,
    });
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

  it('listRecent omits status and mixes outcomes; status exact-matches then caps; miss is empty', async () => {
    const nAccepted = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const nFailedA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const nFailedB = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const nRefused = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    let nowMs = Date.parse('2026-08-12T12:00:00.000Z');
    const s = new MemoryDeliveryStore({ now: () => new Date(nowMs) });

    async function settleAs(
      notificationId: string,
      channel: 'email' | 'inapp' | 'push' | 'sms',
      status: 'accepted' | 'failed' | 'refused',
    ) {
      nowMs += 60_000;
      const claim = await s.claim(notificationId, channel, 3);
      expect(claim.claimed).toBe(true);
      if (!claim.claimed) throw new Error('expected claim');
      await s.settle({
        id: claim.id,
        attempt: 1,
        status,
        attempted: status !== 'refused',
        refusalCode: status === 'refused' ? 'channel.not_configured' : undefined,
      });
    }

    await settleAs(nAccepted, 'inapp', 'accepted');
    await settleAs(nFailedA, 'email', 'failed');
    await settleAs(nFailedB, 'push', 'failed');
    await settleAs(nRefused, 'sms', 'refused');

    const mixed = await s.listRecent(10);
    expect(mixed.map((r) => r.status).sort()).toEqual(['accepted', 'failed', 'failed', 'refused']);

    const failed = await s.listRecent(10, 'failed');
    expect(failed).toHaveLength(2);
    expect(failed.every((r) => r.status === 'failed')).toBe(true);
    expect(failed.map((r) => r.notificationId)).toEqual([nFailedB, nFailedA]);

    const cappedFailed = await s.listRecent(1, 'failed');
    expect(cappedFailed).toHaveLength(1);
    expect(cappedFailed[0]!.status).toBe('failed');
    expect(cappedFailed[0]!.notificationId).toBe(nFailedB);

    expect(await s.listRecent(10, 'abandoned')).toEqual([]);
    expect(await s.listRecent(10, 'pending')).toEqual([]);
  });

  it('operatorDeliveryOutcomes threads status; router refuses delivered and other unknown enums', async () => {
    const a = productHarness();
    await confirmEmail(a.targets);
    const created = await a.notify.create({
      userId: USER,
      kind: 'bank.margin_call',
      titleKey: 'notify.bank.margin_call.title',
      bodyKey: 'notify.bank.margin_call.body',
      severity: 'critical',
      sourceSubject: 'intafaced.bank.margin_call.created',
      sourceIdempotencyKey: 'margin-op-outcomes-status',
    });
    expect(created.inserted).toBe(true);

    const mixed = await a.notify.operatorDeliveryOutcomes(50);
    expect(mixed.map((r) => r.status).sort()).toEqual(['accepted', 'refused', 'refused', 'refused']);

    const accepted = await a.notify.operatorDeliveryOutcomes(50, 'accepted');
    expect(accepted).toHaveLength(1);
    expect(accepted[0]!.status).toBe('accepted');
    expect(accepted[0]!.channel).toBe('inapp');

    const failed = await a.notify.operatorDeliveryOutcomes(50, 'failed');
    expect(failed).toEqual([]);

    const caller = createNotifyRouter(a.notify).createCaller(signed(['admin:read']));
    const wiredAccepted = await caller.notify.ops.deliveries({ limit: 50, status: 'accepted' });
    const aliasAccepted = await caller.notify.operatorDeliveries({ limit: 50, status: 'accepted' });
    expect(wiredAccepted).toHaveLength(1);
    expect(wiredAccepted[0]!.status).toBe('accepted');
    expect(aliasAccepted).toEqual(wiredAccepted);

    await expect(caller.notify.ops.deliveries({ status: 'delivered' as unknown as 'accepted' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    await expect(caller.notify.operatorDeliveries({ status: 'sent' as unknown as 'failed' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('configured in-app is accepted; email without gateway is channel.not_configured — never delivered', async () => {
    const { notify, targets } = productHarness();
    await confirmEmail(targets);
    const created = await notify.create({
      userId: USER,
      kind: 'bank.margin_call',
      titleKey: 'notify.bank.margin_call.title',
      bodyKey: 'notify.bank.margin_call.body',
      severity: 'critical',
      sourceSubject: 'intafaced.bank.margin_call.created',
      sourceIdempotencyKey: 'margin-op-outcomes-1',
    });
    expect(created.inserted).toBe(true);

    const rows = await notify.operatorDeliveryOutcomes(50);
    const inapp = rows.find((r) => r.channel === 'inapp');
    const email = rows.find((r) => r.channel === 'email');

    expect(inapp).toMatchObject({ status: 'accepted', refusalCode: null });
    expect(inapp?.acceptedAt).toBeInstanceOf(Date);
    expect(email).toMatchObject({ status: 'refused', refusalCode: 'channel.not_configured' });
    expect(email?.acceptedAt).toBeNull();
    expect(email?.attemptedAt).toBeNull();
    expect(rows.every((r) => r.status !== ('delivered' as typeof r.status))).toBe(true);

    const caller = createNotifyRouter(notify).createCaller(signed(['admin:read']));
    const wired = await caller.notify.ops.deliveries({ limit: 50 });
    expect(wired.some((r) => r.channel === 'inapp' && r.status === 'accepted')).toBe(true);
    expect(wired.some((r) => r.channel === 'email' && r.status === 'refused' && r.refusalCode === 'channel.not_configured')).toBe(true);
    for (const row of wired) {
      expect(row).not.toHaveProperty('address');
      expect(row).not.toHaveProperty('detail');
      expect(row).not.toHaveProperty('userId');
      expect(row.status).not.toBe('delivered');
    }

    const alias = await caller.notify.operatorDeliveries({ limit: 50 });
    expect(alias).toEqual(wired);
  });

  it('admin:read can call notify.ops.deliveries; notify:read and anonymous cannot', async () => {
    const { notify } = productHarness();
    await notify.create({
      userId: USER,
      kind: 'trade.fill',
      titleKey: 'notify.trade.fill.title',
      bodyKey: 'notify.trade.fill.body',
      sourceSubject: 'intafaced.trade.fill.settled',
      sourceIdempotencyKey: 'fill-op-outcomes-auth',
    });

    const router = createNotifyRouter(notify);
    const asAdmin = await router.createCaller(signed(['admin:read'])).notify.ops.deliveries({ limit: 10 });
    expect(asAdmin.length).toBeGreaterThan(0);

    await expect(router.createCaller(signed(['notify:read'])).notify.ops.deliveries()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(router.createCaller(anonymous()).notify.ops.deliveries()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});

describe('PostgresDeliveryStore.listRecent — status is a SQL predicate', () => {
  it('filters with AND status in the query, not after mapping a mixed page', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, 'channel-store.ts'), 'utf8');
    const pg = src.slice(src.indexOf('export class PostgresDeliveryStore'));
    const list = pg.slice(pg.indexOf('async listRecent('), pg.indexOf('async reapExhausted('));
    expect(list).toMatch(/AND status = \$\{status\}/);
    expect(list).toMatch(/statusMatch/);
    expect(list).not.toMatch(/\.filter\(/);
  });
});
