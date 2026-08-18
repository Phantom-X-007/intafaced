import { describe, expect, it } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { MemoryDeliveryStore } from './channel-store.js';
import { NotifyService, type NotifyServiceDeps } from './notify-service.js';
import { createNotifyRouter } from './router.js';
import { MemoryNotifyStore } from './store.js';
import type { ChannelId } from './channels/channel.js';

/**
 * Notification leftover list — optional exact-match channel and status filters.
 *
 * Load the notification under the caller FIRST. Foreign / unknown ids stay
 * `[]` even when a channel or status is provided. `inapp` is valid here.
 * Invalid channel/status (including invented `delivered`) is 400 at the door.
 * Never invents a leftover or a delivery success. `accepted` ≠ delivered.
 */

const SECRET = 'a-notify-deliveries-channel-test-secret-long';
const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '99999999-9999-4999-8999-999999999999';
const edgeContext = createEdgeContext({ secret: SECRET, serviceName: 'svc-notify' });

function principal(userId = USER): Principal {
  return {
    sub: userId,
    userId,
    sid: '22222222-2222-4222-8222-222222222222',
    scopes: ['notify:read', 'notify:write'],
    tier: 'none',
    mfa: false,
    expiresAt: new Date(Date.now() + 60_000),
  } as Principal;
}

function signed(userId = USER) {
  const raw = encodePrincipal(principal(userId));
  return edgeContext({
    headers: {
      'x-intafaced-principal': raw,
      'x-intafaced-principal-sig': signPrincipalHeader(raw, SECRET, 'DE'),
      'x-intafaced-region': 'DE',
    },
    id: 'req-deliveries-channel',
  });
}

function harness() {
  const store = new MemoryNotifyStore();
  const deliveries = new MemoryDeliveryStore();
  const notify = new NotifyService(store, { fanoutEnabled: true }, {
    deliveries,
  } as unknown as NotifyServiceDeps);
  const caller = createNotifyRouter(notify).createCaller(signed());
  return { store, deliveries, notify, caller };
}

async function ownNote(store: MemoryNotifyStore, userId = USER, key = 'owned') {
  const { notification } = await store.insert({
    userId,
    kind: 'bank.margin_call',
    titleKey: 'notify.bank.margin_call.title',
    bodyKey: 'notify.bank.margin_call.body',
    severity: 'critical',
    sourceSubject: 'bank.loan.margin_called',
    sourceIdempotencyKey: key,
  });
  return notification!;
}

async function leftover(deliveries: MemoryDeliveryStore, notificationId: string, channel: ChannelId) {
  await deliveries.claim(notificationId, channel, 3);
}

async function leftoverAs(
  deliveries: MemoryDeliveryStore,
  notificationId: string,
  channel: ChannelId,
  status: 'accepted' | 'failed' | 'refused',
) {
  const claim = await deliveries.claim(notificationId, channel, 3);
  if (!claim.claimed) throw new Error('expected claim');
  await deliveries.settle({
    id: claim.id,
    attempt: 1,
    status,
    attempted: status !== 'refused',
    refusalCode: status === 'refused' ? 'channel.not_configured' : undefined,
  });
}

describe('notify.deliveries — optional channel filter', () => {
  it('omitted channel returns mixed leftovers for an owned notification, channel ASC', async () => {
    const { store, deliveries, notify, caller } = harness();
    const note = await ownNote(store);
    await leftover(deliveries, note.id, 'sms');
    await leftover(deliveries, note.id, 'inapp');
    await leftover(deliveries, note.id, 'email');

    const omitted = await notify.deliveriesFor(USER, note.id);
    expect(omitted.map((r) => r.channel)).toEqual(['email', 'inapp', 'sms']);

    const viaRouter = await caller.notify.deliveries({ notificationId: note.id });
    expect(viaRouter.map((r) => r.channel)).toEqual(['email', 'inapp', 'sms']);
  });

  it("channel: 'email' returns only email leftovers; unmatched is empty", async () => {
    const { store, deliveries, notify, caller } = harness();
    const note = await ownNote(store);
    await leftover(deliveries, note.id, 'inapp');
    await leftover(deliveries, note.id, 'email');
    await leftover(deliveries, note.id, 'sms');

    const email = await notify.deliveriesFor(USER, note.id, 'email');
    expect(email).toHaveLength(1);
    expect(email[0]?.channel).toBe('email');

    const viaRouter = await caller.notify.deliveries({ notificationId: note.id, channel: 'email' });
    expect(viaRouter).toHaveLength(1);
    expect(viaRouter[0]?.channel).toBe('email');

    const { store: store2, deliveries: deliveries2, notify: notify2, caller: caller2 } = harness();
    const smsOnly = await ownNote(store2, USER, 'sms-only');
    await leftover(deliveries2, smsOnly.id, 'sms');
    expect(await notify2.deliveriesFor(USER, smsOnly.id, 'email')).toEqual([]);
    await expect(caller2.notify.deliveries({ notificationId: smsOnly.id, channel: 'push' })).resolves.toEqual([]);
  });

  it("channel: 'inapp' is valid on this door and returns the in-app leftover", async () => {
    const { store, deliveries, notify, caller } = harness();
    const note = await ownNote(store);
    await leftover(deliveries, note.id, 'inapp');
    await leftover(deliveries, note.id, 'email');

    const inapp = await notify.deliveriesFor(USER, note.id, 'inapp');
    expect(inapp).toHaveLength(1);
    expect(inapp[0]?.channel).toBe('inapp');

    const viaRouter = await caller.notify.deliveries({ notificationId: note.id, channel: 'inapp' });
    expect(viaRouter).toHaveLength(1);
    expect(viaRouter[0]?.channel).toBe('inapp');
  });

  it('foreign notificationId with a channel still returns [] and does not leak existence', async () => {
    const { store, deliveries, notify } = harness();
    const theirs = await ownNote(store, OTHER, 'foreign');
    await leftover(deliveries, theirs.id, 'email');

    expect(await notify.deliveriesFor(USER, theirs.id)).toEqual([]);
    expect(await notify.deliveriesFor(USER, theirs.id, 'email')).toEqual([]);

    const caller = createNotifyRouter(notify).createCaller(signed(USER));
    await expect(caller.notify.deliveries({ notificationId: theirs.id, channel: 'email' })).resolves.toEqual([]);
  });

  it('invalid channel is 400 before the service', async () => {
    const { store, caller } = harness();
    const note = await ownNote(store);
    await expect(caller.notify.deliveries({ notificationId: note.id, channel: 'fax' as unknown as 'email' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('owned notification with no leftovers is still []', async () => {
    const { store, notify } = harness();
    const note = await ownNote(store);
    expect(await notify.deliveriesFor(USER, note.id)).toEqual([]);
    expect(await notify.deliveriesFor(USER, note.id, 'email')).toEqual([]);
  });

  it('omitted status returns mixed leftovers; channel filter still works', async () => {
    const { store, deliveries, notify, caller } = harness();
    const note = await ownNote(store);
    await leftoverAs(deliveries, note.id, 'email', 'accepted');
    await leftoverAs(deliveries, note.id, 'sms', 'refused');
    await leftoverAs(deliveries, note.id, 'inapp', 'failed');

    const mixed = await notify.deliveriesFor(USER, note.id);
    expect(mixed.map((r) => r.channel)).toEqual(['email', 'inapp', 'sms']);
    expect(mixed.map((r) => r.status).sort()).toEqual(['accepted', 'failed', 'refused']);

    const viaRouter = await caller.notify.deliveries({ notificationId: note.id });
    expect(viaRouter.map((r) => r.channel)).toEqual(['email', 'inapp', 'sms']);

    const email = await notify.deliveriesFor(USER, note.id, 'email');
    expect(email).toHaveLength(1);
    expect(email[0]).toMatchObject({ channel: 'email', status: 'accepted' });
    const viaChannel = await caller.notify.deliveries({ notificationId: note.id, channel: 'email' });
    expect(viaChannel).toHaveLength(1);
    expect(viaChannel[0]).toMatchObject({ channel: 'email', status: 'accepted' });
  });

  it('status exact-matches; unmatched status is empty', async () => {
    const { store, deliveries, notify, caller } = harness();
    const note = await ownNote(store);
    await leftoverAs(deliveries, note.id, 'email', 'accepted');
    await leftoverAs(deliveries, note.id, 'sms', 'refused');

    const accepted = await notify.deliveriesFor(USER, note.id, undefined, 'accepted');
    expect(accepted).toHaveLength(1);
    expect(accepted[0]).toMatchObject({ channel: 'email', status: 'accepted' });

    const viaRouter = await caller.notify.deliveries({ notificationId: note.id, status: 'accepted' });
    expect(viaRouter).toHaveLength(1);
    expect(viaRouter[0]?.status).toBe('accepted');

    expect(await notify.deliveriesFor(USER, note.id, undefined, 'failed')).toEqual([]);
    await expect(caller.notify.deliveries({ notificationId: note.id, status: 'abandoned' })).resolves.toEqual([]);
  });

  it('channel and status AND together in the leftover query', async () => {
    const { store, deliveries, notify, caller } = harness();
    const note = await ownNote(store);
    await leftoverAs(deliveries, note.id, 'email', 'accepted');
    await leftoverAs(deliveries, note.id, 'sms', 'accepted');
    await leftoverAs(deliveries, note.id, 'inapp', 'refused');

    const and = await notify.deliveriesFor(USER, note.id, 'email', 'accepted');
    expect(and).toHaveLength(1);
    expect(and[0]).toMatchObject({ channel: 'email', status: 'accepted' });

    const viaRouter = await caller.notify.deliveries({
      notificationId: note.id,
      channel: 'email',
      status: 'accepted',
    });
    expect(viaRouter).toHaveLength(1);
    expect(viaRouter[0]).toMatchObject({ channel: 'email', status: 'accepted' });

    expect(await notify.deliveriesFor(USER, note.id, 'email', 'refused')).toEqual([]);
    await expect(caller.notify.deliveries({ notificationId: note.id, channel: 'sms', status: 'refused' })).resolves.toEqual([]);
  });

  it('delivered is 400 — that stamp does not exist', async () => {
    const { store, caller } = harness();
    const note = await ownNote(store);
    await expect(caller.notify.deliveries({ notificationId: note.id, status: 'delivered' as unknown as 'accepted' })).rejects.toMatchObject(
      {
        code: 'BAD_REQUEST',
      },
    );
  });

  it('foreign notificationId with a status still returns [] and does not leak existence', async () => {
    const { store, deliveries, notify } = harness();
    const theirs = await ownNote(store, OTHER, 'foreign-status');
    await leftoverAs(deliveries, theirs.id, 'email', 'accepted');

    expect(await notify.deliveriesFor(USER, theirs.id, undefined, 'accepted')).toEqual([]);
    expect(await notify.deliveriesFor(USER, theirs.id, 'email', 'accepted')).toEqual([]);

    const caller = createNotifyRouter(notify).createCaller(signed(USER));
    await expect(caller.notify.deliveries({ notificationId: theirs.id, channel: 'email', status: 'accepted' })).resolves.toEqual([]);
  });
});
