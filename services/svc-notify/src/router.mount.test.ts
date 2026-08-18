import { describe, expect, it, vi } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { createNotifyRouter } from './router.js';
import type { NotifyService } from './notify-service.js';

/**
 * THE MOUNT BOUNDARY for svc-notify (docs/decisions/mount-boundary.md).
 *
 * Context comes from `createEdgeContext` over real headers — never a hand-written
 * principal. list / markRead / markAllRead must only run for the edge-signed
 * principal; a forgeable principal here is another account's inbox.
 */

const SECRET = 'a-notify-mount-test-edge-secret-long';
const USER = '11111111-1111-4111-8111-111111111111';
const VICTIM = '99999999-9999-4999-8999-999999999999';

const edgeContext = createEdgeContext({ secret: SECRET, serviceName: 'svc-notify' });

function principal(overrides: Partial<Principal> = {}): Principal {
  return {
    sub: USER,
    userId: USER,
    sid: '22222222-2222-4222-8222-222222222222',
    scopes: ['notify:read', 'notify:write'],
    tier: 'none',
    mfa: false,
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  } as Principal;
}

const anonymous = () => edgeContext({ headers: { 'x-intafaced-region': 'DE' }, id: 'req-anon' });

function signed(p: Principal = principal()) {
  const raw = encodePrincipal(p);
  return edgeContext({
    headers: {
      'x-intafaced-principal': raw,
      'x-intafaced-principal-sig': signPrincipalHeader(raw, SECRET, 'DE'),
      'x-intafaced-region': 'DE',
    },
    id: 'req-signed',
  });
}

function forged(p: Principal = principal()) {
  return edgeContext({
    headers: { 'x-intafaced-principal': encodePrincipal(p), 'x-intafaced-region': 'DE' },
    id: 'req-forged',
  });
}

function stubNotify(overrides: Partial<NotifyService> = {}): NotifyService {
  return {
    fanoutEnabled: true,
    create: vi.fn(),
    list: vi.fn(async () => ({ items: [], nextCursor: null })),
    unreadCount: vi.fn(async () => 0),
    markRead: vi.fn(async () => 0),
    markAllRead: vi.fn(async () => 0),
    ...overrides,
  } as unknown as NotifyService;
}

describe('svc-notify mount — authorisation', () => {
  it('refuses an anonymous caller on list, and reads nothing', async () => {
    let read = false;
    const notify = stubNotify({
      list: async () => {
        read = true;
        return { items: [], nextCursor: null };
      },
    });

    await expect(createNotifyRouter(notify).createCaller(anonymous()).notify.list()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    expect(read).toBe(false);
  });

  it('refuses a self-asserted principal naming another user', async () => {
    let readFor: string | null = null;
    const notify = stubNotify({
      list: async ({ userId }: { userId: string }) => {
        readFor = userId;
        return { items: [], nextCursor: null };
      },
    });

    const ctx = forged(principal({ sub: VICTIM, userId: VICTIM }));
    expect(ctx.principal).toBeNull();

    await expect(createNotifyRouter(notify).createCaller(ctx).notify.list()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    expect(readFor).toBeNull();
  });

  it('accepts an edge-signed principal and lists that principal inbox only', async () => {
    let readFor: string | null = null;
    const notify = stubNotify({
      list: async ({ userId }: { userId: string }) => {
        readFor = userId;
        return { items: [], nextCursor: null };
      },
    });

    await expect(createNotifyRouter(notify).createCaller(signed()).notify.list()).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
    expect(readFor).toBe(USER);
  });

  it('list without kind still asks for the full principal page', async () => {
    let query: { userId: string; unreadOnly: boolean; kind?: string; severity?: string } | null = null;
    const notify = stubNotify({
      list: async (q: { userId: string; unreadOnly: boolean; kind?: string; severity?: string }) => {
        query = q;
        return { items: [], nextCursor: null };
      },
    });

    await expect(createNotifyRouter(notify).createCaller(signed()).notify.list()).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
    expect(query).toMatchObject({ userId: USER, unreadOnly: false });
    expect(query).not.toHaveProperty('kind');
    expect(query).not.toHaveProperty('severity');
  });

  it('list forwards kind exact-match and composes with unreadOnly', async () => {
    let query: { userId: string; unreadOnly: boolean; kind?: string; severity?: string } | null = null;
    const notify = stubNotify({
      list: async (q: { userId: string; unreadOnly: boolean; kind?: string; severity?: string }) => {
        query = q;
        return { items: [], nextCursor: null };
      },
    });

    await expect(
      createNotifyRouter(notify).createCaller(signed()).notify.list({ kind: 'p2p.escrow.locked', unreadOnly: true }),
    ).resolves.toEqual({ items: [], nextCursor: null });
    expect(query).toEqual(expect.objectContaining({ userId: USER, unreadOnly: true, kind: 'p2p.escrow.locked' }));
    expect(query).not.toHaveProperty('severity');
  });

  it('list refuses an empty kind', async () => {
    const notify = stubNotify();
    await expect(createNotifyRouter(notify).createCaller(signed()).notify.list({ kind: '' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('list forwards severity exact-match and composes with unreadOnly and kind', async () => {
    let query: { userId: string; unreadOnly: boolean; kind?: string; severity?: string } | null = null;
    const notify = stubNotify({
      list: async (q: { userId: string; unreadOnly: boolean; kind?: string; severity?: string }) => {
        query = q;
        return { items: [], nextCursor: null };
      },
    });

    await expect(
      createNotifyRouter(notify).createCaller(signed()).notify.list({ kind: 'bank.margin_call', unreadOnly: true, severity: 'critical' }),
    ).resolves.toEqual({ items: [], nextCursor: null });
    expect(query).toEqual(expect.objectContaining({ userId: USER, unreadOnly: true, kind: 'bank.margin_call', severity: 'critical' }));
  });

  it('list refuses a severity outside info|action|critical', async () => {
    const notify = stubNotify();
    await expect(
      createNotifyRouter(notify)
        .createCaller(signed())
        .notify.list({ severity: 'warn' as unknown as 'info' }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('markRead uses principal.userId — never an input user', async () => {
    let markFor: string | null = null;
    const notify = stubNotify({
      markRead: async (userId: string) => {
        markFor = userId;
        return 1;
      },
    });

    const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    await expect(
      createNotifyRouter(notify)
        .createCaller(signed())
        .notify.markRead({ ids: [id] }),
    ).resolves.toEqual({ marked: 1 });
    expect(markFor).toBe(USER);
  });

  it('markAllRead is principal-bound', async () => {
    let markFor: string | null = null;
    const notify = stubNotify({
      markAllRead: async (userId: string) => {
        markFor = userId;
        return 3;
      },
    });

    await expect(createNotifyRouter(notify).createCaller(signed()).notify.markAllRead()).resolves.toEqual({
      marked: 3,
    });
    expect(markFor).toBe(USER);
  });

  it('alerts omits status and still asks for every watch owned by the principal', async () => {
    let listed: { userId: string; status?: string; marketId?: string } | null = null;
    const alerts = {
      list: async (userId: string, status?: string, marketId?: string) => {
        listed = {
          userId,
          ...(status !== undefined ? { status } : {}),
          ...(marketId !== undefined ? { marketId } : {}),
        };
        return [];
      },
      evaluationStatus: () => ({ markSource: 'dark' as const, canFire: false, code: 'alert.price_unavailable' as const }),
    };
    const page = await createNotifyRouter(stubNotify(), alerts as never)
      .createCaller(signed())
      .notify.alerts();
    expect(page.items).toEqual([]);
    expect(page.evaluation).toEqual({ markSource: 'dark', canFire: false, code: 'alert.price_unavailable' });
    expect(listed).toEqual({ userId: USER });
    expect(listed).not.toHaveProperty('status');
    expect(listed).not.toHaveProperty('marketId');
  });

  it('alerts forwards status exact-match to list(userId, status)', async () => {
    let listed: { userId: string; status?: string; marketId?: string } | null = null;
    const alerts = {
      list: async (userId: string, status?: string, marketId?: string) => {
        listed = {
          userId,
          ...(status !== undefined ? { status } : {}),
          ...(marketId !== undefined ? { marketId } : {}),
        };
        return [];
      },
      evaluationStatus: () => ({ markSource: 'dark' as const, canFire: false, code: 'alert.price_unavailable' as const }),
    };
    await createNotifyRouter(stubNotify(), alerts as never)
      .createCaller(signed())
      .notify.alerts({ status: 'fired' });
    expect(listed).toEqual({ userId: USER, status: 'fired' });
  });

  it('alerts forwards marketId exact-match to list(userId, status, marketId)', async () => {
    let listed: { userId: string; status?: string; marketId?: string } | null = null;
    const alerts = {
      list: async (userId: string, status?: string, marketId?: string) => {
        listed = {
          userId,
          ...(status !== undefined ? { status } : {}),
          ...(marketId !== undefined ? { marketId } : {}),
        };
        return [];
      },
      evaluationStatus: () => ({ markSource: 'dark' as const, canFire: false, code: 'alert.price_unavailable' as const }),
    };
    await createNotifyRouter(stubNotify(), alerts as never)
      .createCaller(signed())
      .notify.alerts({ marketId: 'BTC-USD' });
    expect(listed).toEqual({ userId: USER, marketId: 'BTC-USD' });
  });

  it('alerts refuses a status outside active|fired|cancelled', async () => {
    await expect(
      createNotifyRouter(stubNotify())
        .createCaller(signed())
        .notify.alerts({ status: 'pending' as unknown as 'active' }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('alerts refuses empty or too-long marketId', async () => {
    const caller = createNotifyRouter(stubNotify()).createCaller(signed());
    await expect(caller.notify.alerts({ marketId: '' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(caller.notify.alerts({ marketId: 'x'.repeat(65) })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

describe('svc-notify mount — public surface', () => {
  it('serves health to an anonymous caller', async () => {
    await expect(createNotifyRouter(stubNotify()).createCaller(anonymous()).health()).resolves.toEqual({
      ok: true,
      service: 'svc-notify',
      fanoutEnabled: true,
    });
  });
});
