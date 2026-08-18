import { describe, expect, it } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { MemoryNotifyStore } from './store.js';
import { NotifyService, type NotifyServiceDeps } from './notify-service.js';
import { MemoryMuteStore } from './preferences/mute.js';
import { createNotifyRouter } from './router.js';

/**
 * Mute preference list — optional exact-match channel filter.
 *
 * Omitted channel still returns email/push/sms (today). Provided channel is
 * one row from the store, never invented mute state. Unknown channel is 400.
 * `setMute` is unchanged.
 */

const SECRET = 'a-notify-mute-prefs-channel-test-secret-long';
const USER = '11111111-1111-4111-8111-111111111111';
const edgeContext = createEdgeContext({ secret: SECRET, serviceName: 'svc-notify' });

function principal(): Principal {
  return {
    sub: USER,
    userId: USER,
    sid: '22222222-2222-4222-8222-222222222222',
    scopes: ['notify:read', 'notify:write'],
    tier: 'none',
    mfa: false,
    expiresAt: new Date(Date.now() + 60_000),
  } as Principal;
}

function signed() {
  const raw = encodePrincipal(principal());
  return edgeContext({
    headers: {
      'x-intafaced-principal': raw,
      'x-intafaced-principal-sig': signPrincipalHeader(raw, SECRET, 'DE'),
      'x-intafaced-region': 'DE',
    },
    id: 'req-mute-prefs',
  });
}

function harness() {
  const muteStore = new MemoryMuteStore();
  const notify = new NotifyService(new MemoryNotifyStore(), { fanoutEnabled: true }, {
    muteStore,
  } as unknown as NotifyServiceDeps);
  return { notify, muteStore };
}

describe('listMutePrefs — optional channel filter', () => {
  it('omitted channel returns all three rows from the store', async () => {
    const { notify, muteStore } = harness();
    await muteStore.setMuted(USER, 'email', true);

    const omitted = await notify.listMutePrefs(USER);
    expect(omitted).toEqual([
      { channel: 'email', muted: true },
      { channel: 'push', muted: false },
      { channel: 'sms', muted: false },
    ]);

    const caller = createNotifyRouter(notify).createCaller(signed());
    await expect(caller.notify.mutePrefs()).resolves.toEqual(omitted);
    await expect(caller.notify.mutePrefs({})).resolves.toEqual(omitted);
  });

  it("channel: 'sms' returns only sms, still reading the store", async () => {
    const { notify, muteStore } = harness();
    await muteStore.setMuted(USER, 'sms', true);
    await muteStore.setMuted(USER, 'email', true);

    const sms = await notify.listMutePrefs(USER, 'sms');
    expect(sms).toEqual([{ channel: 'sms', muted: true }]);

    const caller = createNotifyRouter(notify).createCaller(signed());
    await expect(caller.notify.mutePrefs({ channel: 'sms' })).resolves.toEqual(sms);
  });

  it('bad channel is 400', async () => {
    const { notify } = harness();
    const caller = createNotifyRouter(notify).createCaller(signed());
    await expect(caller.notify.mutePrefs({ channel: 'inapp' as unknown as 'sms' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });
});
