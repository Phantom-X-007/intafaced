import { describe, expect, it, vi } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { AcademyError } from './errors.js';
import { createAcademyRouter } from './router.js';
import type { AcademyService } from './academy-service.js';

/**
 * THE MOUNT BOUNDARY for svc-academy (docs/decisions/mount-boundary.md).
 *
 * Context comes from `createEdgeContext` over real headers — never a
 * hand-written principal. A seat belongs to the edge-signed caller and to
 * nobody else, and a forgeable principal here is a seat in a staked room that
 * nobody staked for.
 *
 * This file also exists because a service that builds a router and never
 * registers it answers 200 on `/health` and 404 on everything else. That has
 * bitten this repo three times. Calling every procedure through
 * `createCaller` is the cheapest proof that the surface is real.
 */

const SECRET = 'an-academy-mount-test-edge-secret-long';
const USER = '11111111-1111-4111-8111-111111111111';
const VICTIM = '99999999-9999-4999-8999-999999999999';
const SESSION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ROOM = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const edgeContext = createEdgeContext({ secret: SECRET, serviceName: 'svc-academy' });

function principal(overrides: Partial<Principal> = {}): Principal {
  return {
    sub: USER,
    userId: USER,
    sid: '22222222-2222-4222-8222-222222222222',
    scopes: ['academy:read', 'academy:write'],
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

const room = {
  id: ROOM,
  slug: 'meme-war-room',
  name: 'Meme War Room',
  kind: 'meme_war_room' as const,
  access: 'staked' as const,
  minStake: 1_000_000_000_000_000_000n,
  capacity: 50,
  hostId: USER,
};

function stubAcademy(overrides: Partial<AcademyService> = {}): AcademyService {
  return {
    listRooms: vi.fn(async () => [room]),
    room: vi.fn(async () => room),
    listSessions: vi.fn(async () => []),
    session: vi.fn(async () => ({
      id: SESSION,
      roomId: ROOM,
      title: 'Session',
      hostId: USER,
      status: 'live' as const,
      startsAt: new Date(),
      endsAt: null,
      streamProvider: null,
      streamRoom: null,
      scene: {},
    })),
    occupancy: vi.fn(async () => 3),
    join: vi.fn(async () => ({ role: 'attendee' as const })),
    leave: vi.fn(async () => undefined),
    streamCredential: vi.fn(),
    createRoom: vi.fn(async () => room),
    invite: vi.fn(async () => undefined),
    ...overrides,
  } as unknown as AcademyService;
}

describe('svc-academy mount — the router is actually mounted', () => {
  it('serves health to an anonymous caller', async () => {
    await expect(createAcademyRouter(stubAcademy()).createCaller(anonymous()).health()).resolves.toEqual({
      ok: true,
      service: 'svc-academy',
    });
  });

  it('exposes the lobby surface §8.3 names plus the thin curriculum catalog', () => {
    const procedures = Object.keys(createAcademyRouter(stubAcademy())._def.procedures).sort();

    expect(procedures).toEqual(
      [
        'createRoom',
        'curriculum',
        'curriculumItem',
        'curriculumInventory',
        'paperDrill',
        'ambassadorBadge',
        'ambassadors',
        'appointAmbassador',
        'freezeAmbassador',
        'seasons',
        'season',
        'standings',
        'createSeason',
        'setSeasonStatus',
        'setStanding',
        'endSession',
        'health',
        'invite',
        'join',
        'leave',
        'room',
        'rooms',
        'scheduleSession',
        'session',
        'startSession',
        'streamCredential',
        'updateScene',
      ].sort(),
    );
  });
});

describe('svc-academy mount — curriculum catalog is real, not empty', () => {
  it('lists the day-one spine under academy:read', async () => {
    const items = await createAcademyRouter(stubAcademy()).createCaller(signed()).curriculum();
    expect(items.length).toBeGreaterThanOrEqual(4);
    expect(items.every((i) => typeof i.slug === 'string' && typeof i.summary === 'string')).toBe(true);
    // List is metadata only — body lives on curriculumItem.
    expect(items[0]).not.toHaveProperty('body');
  });

  it('filters curriculum by Blueprint path', async () => {
    const items = await createAcademyRouter(stubAcademy()).createCaller(signed()).curriculum({ path: 'foundations' });
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.path === 'foundations')).toBe(true);
  });

  it('returns body for a known slug and NOT_FOUND for an unknown one', async () => {
    const caller = createAcademyRouter(stubAcademy()).createCaller(signed());
    const item = await caller.curriculumItem({ slug: 'foundations-risk-first' });
    expect(item.body).toContain('# Risk first');

    await expect(caller.curriculumItem({ slug: 'no-such-playbook' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('refuses curriculum without academy:read', async () => {
    const ctx = signed(principal({ scopes: [] }));
    await expect(createAcademyRouter(stubAcademy()).createCaller(ctx).curriculum()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

describe('svc-academy mount — a seat belongs to the signed caller', () => {
  it('refuses an anonymous caller a seat, and takes none', async () => {
    let joined = false;
    const academy = stubAcademy({
      join: (async () => {
        joined = true;
        return { role: 'attendee' as const };
      }) as AcademyService['join'],
    });

    await expect(createAcademyRouter(academy).createCaller(anonymous()).join({ sessionId: SESSION })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    expect(joined).toBe(false);
  });

  it('refuses a self-asserted principal — an unsigned header is not a principal', async () => {
    const ctx = forged(principal({ sub: VICTIM, userId: VICTIM }));
    expect(ctx.principal).toBeNull();

    await expect(createAcademyRouter(stubAcademy()).createCaller(ctx).join({ sessionId: SESSION })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('seats the edge-signed principal and nobody else — there is no userId input to abuse', async () => {
    let seatedFor: string | null = null;
    const academy = stubAcademy({
      join: (async ({ userId }: { userId: string }) => {
        seatedFor = userId;
        return { role: 'attendee' as const };
      }) as AcademyService['join'],
    });

    await expect(createAcademyRouter(academy).createCaller(signed()).join({ sessionId: SESSION })).resolves.toEqual({ role: 'attendee' });
    expect(seatedFor).toBe(USER);
  });

  it('leave is principal-bound too — you cannot eject another attendee', async () => {
    let leftFor: string | null = null;
    const academy = stubAcademy({
      leave: (async ({ userId }: { userId: string }) => {
        leftFor = userId;
      }) as AcademyService['leave'],
    });

    await createAcademyRouter(academy).createCaller(signed()).leave({ sessionId: SESSION });
    expect(leftFor).toBe(USER);
  });

  it('a read scope alone cannot take a seat', async () => {
    const ctx = signed(principal({ scopes: ['academy:read'] }));
    await expect(createAcademyRouter(stubAcademy()).createCaller(ctx).join({ sessionId: SESSION })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

describe('svc-academy mount — hosting is the caller own claim', () => {
  it('createRoom names the signed principal as host, never an input', async () => {
    let hostId: string | null = null;
    const academy = stubAcademy({
      createRoom: (async (input: { hostId: string }) => {
        hostId = input.hostId;
        return room;
      }) as AcademyService['createRoom'],
    });

    await createAcademyRouter(academy)
      .createCaller(signed())
      .createRoom({ slug: 'forex-desk', name: 'Forex Desk', kind: 'forex', access: 'free', capacity: 25 });

    expect(hostId).toBe(USER);
  });

  it('surfaces the §4.1 host-rights refusal as FORBIDDEN, not as a 500', async () => {
    // The distinction is what the UI can do about it: a 403 with this code is
    // "rank up to host", which is an action. A 500 is a dead end.
    const academy = stubAcademy({
      createRoom: (async () => {
        throw new AcademyError('rank does not host', 'academy.host_rights_required');
      }) as AcademyService['createRoom'],
    });

    await expect(
      createAcademyRouter(academy)
        .createCaller(signed())
        .createRoom({ slug: 'forex-desk', name: 'Forex Desk', kind: 'forex', access: 'free', capacity: 25 }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('surfaces an UNREADABLE perk table as a 500 — "try again", not "go and rank up"', async () => {
    const academy = stubAcademy({
      createRoom: (async () => {
        throw new AcademyError('identity unreachable', 'academy.host_rights_unavailable');
      }) as AcademyService['createRoom'],
    });

    await expect(
      createAcademyRouter(academy)
        .createCaller(signed())
        .createRoom({ slug: 'forex-desk', name: 'Forex Desk', kind: 'forex', access: 'free', capacity: 25 }),
    ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
  });

  it('invite is the one procedure naming another user, and it is host-gated in the service', async () => {
    let invitedBy: string | null = null;
    const academy = stubAcademy({
      invite: (async (input: { hostId: string }) => {
        invitedBy = input.hostId;
      }) as AcademyService['invite'],
    });

    await createAcademyRouter(academy).createCaller(signed()).invite({ roomId: ROOM, userId: VICTIM });
    // The caller cannot claim to be someone else's host: `hostId` comes from
    // the signed principal, and the service compares it to `rooms.host_id`.
    expect(invitedBy).toBe(USER);
  });
});

describe('svc-academy mount — a stake threshold is a decimal string on the wire', () => {
  it('serialises minStake out as a string, never a number', async () => {
    const [out] = await createAcademyRouter(stubAcademy()).createCaller(signed()).rooms();
    expect(typeof out!.minStake).toBe('string');
    expect(out!.minStake).toBe('1');
  });

  it('parses a threshold in without letting the wire string reach the service', async () => {
    let received: unknown;
    const academy = stubAcademy({
      createRoom: (async (input: { minStake?: unknown }) => {
        received = input.minStake;
        return room;
      }) as AcademyService['createRoom'],
    });

    await createAcademyRouter(academy)
      .createCaller(signed())
      .createRoom({ slug: 'staked-room', name: 'Staked', kind: 'general', access: 'staked', minStake: '2.5', capacity: 10 });

    // A scaled bigint, not '2.5'. Doctrine §0.3 — money is never a number, and
    // it is never a raw string past the boundary either.
    expect(typeof received).toBe('bigint');
    expect(received).toBe(2_500_000_000_000_000_000n);
  });

  it('rejects a float-shaped threshold at the edge of the router', async () => {
    await expect(
      createAcademyRouter(stubAcademy())
        .createCaller(signed())
        // @ts-expect-error a number is exactly what must not be accepted here
        .createRoom({ slug: 'r', name: 'R', kind: 'general', access: 'staked', minStake: 2.5, capacity: 10 }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

describe('svc-academy mount — no SFU means an error, never a fake token', () => {
  it('reports stream_unavailable as a 500 rather than returning a credential', async () => {
    const academy = stubAcademy({
      streamCredential: (async () => {
        throw new AcademyError('no provider configured', 'academy.stream_unavailable');
      }) as AcademyService['streamCredential'],
    });

    const call = createAcademyRouter(academy).createCaller(signed()).streamCredential({ sessionId: SESSION });

    // The shape of the failure matters as much as the fact of it: a client that
    // got `{ url, token }` here would try to connect and hang.
    await expect(call).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
    await expect(call).rejects.not.toHaveProperty('token');
  });
});

describe('svc-academy mount — the paper drill gate is reachable, and refuses live', () => {
  const caller = () => createAcademyRouter(stubAcademy()).createCaller(signed());
  const paperMarket = { marketId: 'mkt-paper-1', paper: true, symbol: 'BTC-USDT' };

  it('returns the drill steps for a workbook on a paper market', async () => {
    const result = await caller().paperDrill({ slug: 'foundations-paper-workbook', market: paperMarket });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected a paper drill');
    expect(result.marketId).toBe('mkt-paper-1');
    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.steps.every((step) => step.id && step.instruction)).toBe(true);
  });

  it('REFUSES a market trade did not flag as paper — this is the whole point', async () => {
    const result = await caller().paperDrill({
      slug: 'foundations-paper-workbook',
      market: { ...paperMarket, paper: false },
    });

    expect(result).toMatchObject({ ok: false, reason: 'not_paper' });
  });

  it('refuses with no market rather than defaulting to one', async () => {
    const result = await caller().paperDrill({ slug: 'foundations-paper-workbook', market: null });

    expect(result).toMatchObject({ ok: false, reason: 'no_market' });
  });

  it('refuses a catalog item that is not a workbook', async () => {
    const notAWorkbook = await caller().curriculum({ kind: 'playbook' });
    const slug = notAWorkbook[0]?.slug;
    expect(slug).toBeTruthy();

    const result = await caller().paperDrill({ slug: slug as string, market: paperMarket });

    expect(result).toMatchObject({ ok: false });
  });

  it('rejects a slug that is not in the spine at all', async () => {
    await expect(caller().paperDrill({ slug: 'no-such-workbook', market: paperMarket })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
