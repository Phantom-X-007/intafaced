import { describe, expect, it } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { MemoryTargetStore } from './channel-store.js';
import { NotifyService, type NotifyServiceDeps } from './notify-service.js';
import { createNotifyRouter } from './router.js';
import { MemoryNotifyStore } from './store.js';
import type { OutOfAppChannel } from './channels/channel.js';

/**
 * Channel-target list — optional exact-match channel filter.
 *
 * Omitted channel still returns mixed out-of-app rows (today). Provided
 * channel is a store predicate, never a mixed-page post-filter. Unknown
 * channel is empty. Invalid including `inapp` is 400. Never invents a row.
 */

const SECRET = 'a-notify-targets-channel-test-secret-long';
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
    id: 'req-targets-channel',
  });
}

async function seed(store: MemoryTargetStore, userId: string, channel: OutOfAppChannel, address: string): Promise<void> {
  await store.upsert({
    userId,
    channel,
    address,
    locale: 'en',
    verifyTokenHash: 't'.repeat(64),
    verifyExpiresAt: new Date(Date.now() + 60_000),
  });
}

function harness() {
  const targets = new MemoryTargetStore();
  const notify = new NotifyService(new MemoryNotifyStore(), { fanoutEnabled: true }, {
    targets,
  } as unknown as NotifyServiceDeps);
  const caller = createNotifyRouter(notify).createCaller(signed());
  return { targets, notify, caller };
}

describe('notify.targets — optional channel filter', () => {
  it('omitted channel returns mixed out-of-app targets for the caller', async () => {
    const { targets, notify, caller } = harness();
    await seed(targets, USER, 'email', 'me@example.com');
    await seed(targets, USER, 'sms', '+447700900000');
    await seed(targets, OTHER, 'email', 'them@example.com');

    const omitted = await notify.listTargets(USER);
    expect(omitted.map((t) => t.channel).sort()).toEqual(['email', 'sms']);
    expect(omitted.every((t) => t.userId === USER)).toBe(true);

    const viaRouter = await caller.notify.targets();
    const emptyInput = await caller.notify.targets({});
    expect(viaRouter.map((t) => t.channel).sort()).toEqual(['email', 'sms']);
    expect(emptyInput.map((t) => t.channel).sort()).toEqual(['email', 'sms']);
    expect(viaRouter.map((t) => t.address).sort()).toEqual(['+447700900000', 'me@example.com']);
  });

  it("channel: 'email' returns only that target, still reading the store", async () => {
    const { targets, notify, caller } = harness();
    await seed(targets, USER, 'email', 'me@example.com');
    await seed(targets, USER, 'sms', '+447700900000');

    const email = await notify.listTargets(USER, 'email');
    expect(email).toHaveLength(1);
    expect(email[0]).toMatchObject({ channel: 'email', address: 'me@example.com', userId: USER });

    const viaRouter = await caller.notify.targets({ channel: 'email' });
    expect(viaRouter).toHaveLength(1);
    expect(viaRouter[0]).toMatchObject({ channel: 'email', address: 'me@example.com' });
  });

  it('unmatched channel returns empty, never invents a target row', async () => {
    const { targets, notify, caller } = harness();
    await seed(targets, USER, 'sms', '+447700900000');

    expect(await notify.listTargets(USER, 'email')).toEqual([]);
    await expect(caller.notify.targets({ channel: 'push' })).resolves.toEqual([]);
  });

  it('inapp or garbage channel is 400 before the service', async () => {
    const { caller } = harness();
    await expect(caller.notify.targets({ channel: 'inapp' as unknown as 'email' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    await expect(caller.notify.targets({ channel: 'pager' as unknown as 'email' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('another owner is never leaked for the same channel', async () => {
    const { targets, notify } = harness();
    await seed(targets, USER, 'email', 'me@example.com');
    await seed(targets, OTHER, 'email', 'them@example.com');

    const mine = await createNotifyRouter(notify).createCaller(signed(USER)).notify.targets({ channel: 'email' });
    expect(mine).toHaveLength(1);
    expect(mine[0]!.address).toBe('me@example.com');

    const theirs = await createNotifyRouter(notify).createCaller(signed(OTHER)).notify.targets({ channel: 'email' });
    expect(theirs).toHaveLength(1);
    expect(theirs[0]!.address).toBe('them@example.com');
  });
});
