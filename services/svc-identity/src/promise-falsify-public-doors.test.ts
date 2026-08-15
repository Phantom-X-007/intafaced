/**
 * Unit card (D26-P2-12 identity slice):
 * Promise: sub-account ownership / cross-leak ban still honest through mounted
 *   Fastify+tRPC public doors and the S2S ownership HTTP snapshot — not
 *   createCaller / AuthService-unit theater (#1743 already covers caller).
 * Break: a stranger could assertOwned / assertTransferDoor / revoke another
 *   identity's partition; a missing id could invent primary; list/S2S could
 *   invent a balance identity must never hold.
 * Done bar:
 *   · POST /trpc/subAccounts.assertOwned refuses foreign / missing / revoked
 *     over the wire (FORBIDDEN / BAD_REQUEST); never defaults to primary.
 *   · POST /trpc/subAccounts.assertTransferDoor refuses cross-parent leak
 *     and posts nothing (identity has no ledger post on this door).
 *   · GET /trpc/subAccounts.list is parent-scoped; payload has no balance.
 *   · GET /internal/sub-accounts/:id requires service auth; 404 unknown;
 *     snapshot is {id, parentUserId, revoked} only.
 * Class: N (honesty) / M surface (no invented balances). Leverage:
 *   createIdentityRouter + createEdgeContext + verifyServiceHeaders
 *   (Phase A S-ID / D-S-11 — wire existing doors, do not rebuild).
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, serviceAuthHeaders, signPrincipalHeader, verifyServiceHeaders } from '@intafaced/contracts';
import { AuthError, type AuthService } from './auth/auth-service.js';
import type { RankService } from './rank/rank-service.js';
import { createIdentityRouter } from './router.js';

const EDGE_SECRET = 'identity-promise-falsify-public-doors-edge-secret-32';
const INTERNAL_SECRET = 'identity-promise-falsify-public-doors-internal';
const OWNER = '11111111-1111-4111-8111-111111111111';
const STRANGER = '22222222-2222-4222-8222-222222222222';
const GHOST = '00000000-0000-4000-8000-000000000099';

const here = dirname(fileURLToPath(import.meta.url));
const edgeContext = createEdgeContext({ secret: EDGE_SECRET, serviceName: 'svc-identity' });

type Book = {
  id: string;
  parentUserId: string;
  label: string;
  purpose: string | null;
  revoked: boolean;
  createdAt: Date;
};

/**
 * In-memory books that copy AuthService fail-closed rules (SPEC-SUBACCOUNTS
 * §1–§2). Public-door tests prove the wire; identity.test.ts still owns Postgres.
 */
class MemorySubAccountAuth {
  readonly books = new Map<string, Book>();

  async createSubAccount(userId: string, label: string, purpose?: string): Promise<{ id: string }> {
    const id = randomUUID();
    this.books.set(id, {
      id,
      parentUserId: userId,
      label,
      purpose: purpose ?? null,
      revoked: false,
      createdAt: new Date('2026-08-15T00:00:00.000Z'),
    });
    return { id };
  }

  async listSubAccounts(userId: string): Promise<Book[]> {
    return [...this.books.values()].filter((b) => b.parentUserId === userId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async revokeSubAccount(userId: string, subAccountId: string): Promise<boolean> {
    const row = this.books.get(subAccountId);
    if (!row || row.parentUserId !== userId || row.revoked) return false;
    row.revoked = true;
    return true;
  }

  async getSubAccountOwnership(subAccountId: string): Promise<{ id: string; parentUserId: string; revoked: boolean } | null> {
    const row = this.books.get(subAccountId);
    if (!row) return null;
    return { id: row.id, parentUserId: row.parentUserId, revoked: row.revoked };
  }

  async assertSubAccountOwned(userId: string, subAccountId: string | null | undefined): Promise<{ id: string; parentUserId: string }> {
    const id = typeof subAccountId === 'string' ? subAccountId.trim() : '';
    if (!id) {
      throw new AuthError(
        'Sub-account id is required — a missing id is a refusal, never a default to primary',
        'auth.sub_account_required',
      );
    }
    const row = await this.getSubAccountOwnership(id);
    if (!row || row.parentUserId !== userId) {
      throw new AuthError('Sub-account not found or not owned by caller', 'auth.sub_account_denied');
    }
    if (row.revoked) {
      throw new AuthError('Sub-account is revoked', 'auth.sub_account_revoked');
    }
    return { id: row.id, parentUserId: row.parentUserId };
  }

  async assertSubAccountTransferDoor(
    userId: string,
    fromSubAccountId: string | null | undefined,
    toSubAccountId: string | null | undefined,
  ): Promise<{ fromId: string; toId: string }> {
    const fromId = typeof fromSubAccountId === 'string' ? fromSubAccountId.trim() : '';
    const toId = typeof toSubAccountId === 'string' ? toSubAccountId.trim() : '';
    if (!fromId || !toId) {
      throw new AuthError(
        'Both from and to sub-account ids are required — a missing id is a refusal, never a default to primary',
        'auth.sub_account_required',
      );
    }
    if (fromId === toId) {
      throw new AuthError('A transfer needs two different sub-accounts', 'auth.sub_account_same');
    }
    const from = await this.assertSubAccountOwned(userId, fromId);
    const to = await this.assertSubAccountOwned(userId, toId);
    return { fromId: from.id, toId: to.id };
  }
}

type WireBody = {
  result?: { data?: unknown };
  error?: { message?: string; data?: { code?: string; httpStatus?: number } };
};

function principal(overrides: Partial<Principal> = {}): Principal {
  return {
    sub: OWNER,
    userId: OWNER,
    sid: '44444444-4444-4444-8444-444444444444',
    scopes: ['identity:read', 'identity:write'],
    tier: 'full',
    mfa: true,
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  } as Principal;
}

function signedHeaders(p: Principal = principal()): Record<string, string> {
  const raw = encodePrincipal(p);
  return {
    'x-intafaced-principal': raw,
    'x-intafaced-principal-sig': signPrincipalHeader(raw, EDGE_SECRET, 'DE'),
    'x-intafaced-region': 'DE',
  };
}

function unwrapData(body: WireBody): unknown {
  const data = body.result?.data;
  if (data && typeof data === 'object' && 'json' in (data as Record<string, unknown>)) {
    return (data as { json: unknown }).json;
  }
  return data;
}

const BALANCE_KEYS = ['balance', 'available', 'hold', 'amount', 'qty'];

function assertNoInventedBalance(payload: unknown, path = '$'): void {
  if (payload === null || payload === undefined) return;
  if (Array.isArray(payload)) {
    payload.forEach((item, i) => assertNoInventedBalance(item, `${path}[${i}]`));
    return;
  }
  if (typeof payload !== 'object') return;
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    expect(BALANCE_KEYS, `${path}.${key} must not invent a balance field`).not.toContain(key.toLowerCase());
    assertNoInventedBalance(value, `${path}.${key}`);
  }
}

async function mountDoors(auth: MemorySubAccountAuth): Promise<FastifyInstance> {
  const router = createIdentityRouter(auth as unknown as AuthService, {} as RankService, { registrationOpen: true });
  const app = Fastify({ logger: false });
  await app.register(fastifyTRPCPlugin, {
    prefix: '/trpc',
    trpcOptions: {
      router,
      createContext: ({ req }) => edgeContext({ headers: req.headers, id: req.id }),
    } satisfies FastifyTRPCPluginOptions<typeof router>['trpcOptions'],
  });

  // Same S2S ownership door index.ts mounts for svc-trade placeOrder.
  app.get<{ Params: { subAccountId: string } }>('/internal/sub-accounts/:subAccountId', async (req, reply) => {
    if (verifyServiceHeaders(req.headers, INTERNAL_SECRET).service === null) {
      return reply.code(401).send({ error: 'service credentials required', code: 'identity.unauthenticated' });
    }
    const row = await auth.getSubAccountOwnership(req.params.subAccountId);
    if (!row) {
      return reply.code(404).send({ error: 'sub-account not found', code: 'identity.sub_account_not_found' });
    }
    return row;
  });

  await app.ready();
  return app;
}

let books: MemorySubAccountAuth;
let app: FastifyInstance;

beforeAll(async () => {
  books = new MemorySubAccountAuth();
  app = await mountDoors(books);
}, 20_000);

beforeEach(() => {
  books.books.clear();
});

afterAll(async () => {
  await app.close();
});

async function post(
  app: FastifyInstance,
  path: string,
  input: Record<string, unknown> | undefined,
  headers: Record<string, string> = signedHeaders(),
): Promise<{ statusCode: number; body: WireBody }> {
  const res = await app.inject({ method: 'POST', url: `/trpc/${path}`, headers, payload: input ?? {} });
  return { statusCode: res.statusCode, body: res.json() as WireBody };
}

async function get(
  app: FastifyInstance,
  path: string,
  headers: Record<string, string> = signedHeaders(),
): Promise<{ statusCode: number; body: WireBody }> {
  const res = await app.inject({ method: 'GET', url: `/trpc/${path}`, headers });
  return { statusCode: res.statusCode, body: res.json() as WireBody };
}

describe('D26-P2-12 refuse-closed identity money doors (no invent balances)', () => {
  it('tRPC list/assertOwned/assertTransferDoor output schemas have no balance columns', () => {
    const src = readFileSync(join(here, 'router.ts'), 'utf8');
    const start = src.indexOf('subAccounts: router({');
    expect(start).toBeGreaterThanOrEqual(0);
    const block = src.slice(start, src.indexOf('affiliates: router({', start));
    expect(block).toMatch(/assertOwned:\s*scopedProcedure/);
    expect(block).toMatch(/assertTransferDoor:\s*scopedProcedure/);
    expect(block.toLowerCase()).not.toMatch(/\bbalance\b/);
    expect(block.toLowerCase()).not.toMatch(/\bavailable\b/);
    expect(block.toLowerCase()).not.toMatch(/\bhold\b/);
  });

  it('S2S ownership snapshot in index.ts stays fail-closed (401 / 404, no balance body)', () => {
    const src = readFileSync(join(here, 'index.ts'), 'utf8');
    const start = src.indexOf('/internal/sub-accounts/:subAccountId');
    expect(start).toBeGreaterThanOrEqual(0);
    const block = src.slice(start, start + 900);
    expect(block).toMatch(/verifyServiceHeaders/);
    expect(block).toMatch(/identity\.unauthenticated/);
    expect(block).toMatch(/identity\.sub_account_not_found/);
    expect(block).toMatch(/getSubAccountOwnership/);
    expect(block.toLowerCase()).not.toMatch(/\bbalance\b/);
  });
});

describe('D26-P2-12 public doors — ownership gate over mounted tRPC', () => {
  it('assertOwned accepts a live partition the caller owns and returns no balance', async () => {
    const mine = await books.createSubAccount(OWNER, 'bot');
    const { statusCode, body } = await post(app, 'subAccounts.assertOwned', { subAccountId: mine.id });
    expect(statusCode).toBe(200);
    const data = unwrapData(body);
    expect(data).toEqual({ id: mine.id, parentUserId: OWNER });
    assertNoInventedBalance(data);
  });

  it('assertOwned refuses a missing id over the wire — never invents primary', async () => {
    await books.createSubAccount(OWNER, 'only');
    const { statusCode, body } = await post(app, 'subAccounts.assertOwned', { subAccountId: null });
    expect(statusCode).toBe(400);
    expect(body.error?.data?.code).toBe('BAD_REQUEST');
    expect(body.error?.message).toMatch(/never a default to primary/i);
  });

  it('assertOwned refuses foreign and ghost with the same denied shape (no existence oracle)', async () => {
    const theirs = await books.createSubAccount(STRANGER, 'theirs');
    const foreign = await post(app, 'subAccounts.assertOwned', { subAccountId: theirs.id });
    const ghost = await post(app, 'subAccounts.assertOwned', { subAccountId: GHOST });

    expect(foreign.statusCode).toBe(403);
    expect(ghost.statusCode).toBe(403);
    expect(foreign.body.error?.data?.code).toBe('FORBIDDEN');
    expect(ghost.body.error?.data?.code).toBe('FORBIDDEN');
    expect(foreign.body.error?.message).toBe(ghost.body.error?.message);
    expect(foreign.body.error?.message).toMatch(/not found or not owned/i);
  });

  it('assertOwned refuses a revoked partition over the wire', async () => {
    const dead = await books.createSubAccount(OWNER, 'dead');
    await books.revokeSubAccount(OWNER, dead.id);
    const { statusCode, body } = await post(app, 'subAccounts.assertOwned', { subAccountId: dead.id });
    expect(statusCode).toBe(403);
    expect(body.error?.data?.code).toBe('FORBIDDEN');
    expect(body.error?.message).toMatch(/revoked/i);
  });
});

describe('D26-P2-12 public doors — cross-sub-account leak refuse', () => {
  it('assertTransferDoor refuses a foreign to-leg (cross-parent leak)', async () => {
    const mine = await books.createSubAccount(OWNER, 'from');
    const theirs = await books.createSubAccount(STRANGER, 'to');
    const { statusCode, body } = await post(app, 'subAccounts.assertTransferDoor', {
      fromSubAccountId: mine.id,
      toSubAccountId: theirs.id,
    });
    expect(statusCode).toBe(403);
    expect(body.error?.data?.code).toBe('FORBIDDEN');
    expect(body.error?.message).toMatch(/not found or not owned/i);
  });

  it('assertTransferDoor happy path returns ids and still invents no balance', async () => {
    const a = await books.createSubAccount(OWNER, 'from');
    const b = await books.createSubAccount(OWNER, 'to');
    const { statusCode, body } = await post(app, 'subAccounts.assertTransferDoor', {
      fromSubAccountId: a.id,
      toSubAccountId: b.id,
    });
    expect(statusCode).toBe(200);
    const data = unwrapData(body);
    expect(data).toEqual({ fromId: a.id, toId: b.id });
    assertNoInventedBalance(data);
  });

  it('list is parent-scoped — stranger does not see owner books; no balance fields', async () => {
    const mine = await books.createSubAccount(OWNER, 'mine');
    await books.createSubAccount(STRANGER, 'theirs');

    const ownerList = await get(app, 'subAccounts.list');
    expect(ownerList.statusCode).toBe(200);
    const ownerRows = unwrapData(ownerList.body) as Array<Record<string, unknown>>;
    expect(ownerRows).toHaveLength(1);
    expect(ownerRows[0]?.id).toBe(mine.id);
    assertNoInventedBalance(ownerRows);

    const strangerList = await get(
      app,
      'subAccounts.list',
      signedHeaders(principal({ sub: STRANGER, userId: STRANGER, scopes: ['identity:read'] })),
    );
    expect(strangerList.statusCode).toBe(200);
    const strangerRows = unwrapData(strangerList.body) as Array<Record<string, unknown>>;
    expect(strangerRows).toHaveLength(1);
    expect(strangerRows[0]?.id).not.toBe(mine.id);
    assertNoInventedBalance(strangerRows);
  });

  it('revoke over the wire is self-only — stranger cannot retire owner books', async () => {
    const mine = await books.createSubAccount(OWNER, 'keep');
    const attack = await post(
      app,
      'subAccounts.revoke',
      { subAccountId: mine.id },
      signedHeaders(principal({ sub: STRANGER, userId: STRANGER })),
    );
    expect(attack.statusCode).toBe(200);
    expect(unwrapData(attack.body)).toEqual({ revoked: false });
    expect(books.books.get(mine.id)?.revoked).toBe(false);
  });
});

describe('D26-P2-12 public doors — S2S ownership HTTP snapshot', () => {
  it('refuses without service credentials', async () => {
    const mine = await books.createSubAccount(OWNER, 's2s');
    const res = await app.inject({ method: 'GET', url: `/internal/sub-accounts/${mine.id}` });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ code: 'identity.unauthenticated' });
  });

  it('404 unknown id — never invents a live partition', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/internal/sub-accounts/${GHOST}`,
      headers: serviceAuthHeaders('svc-trade', INTERNAL_SECRET),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ code: 'identity.sub_account_not_found' });
  });

  it('returns parent + revoked only — no invented balance', async () => {
    const mine = await books.createSubAccount(OWNER, 's2s-book');
    const live = await app.inject({
      method: 'GET',
      url: `/internal/sub-accounts/${mine.id}`,
      headers: serviceAuthHeaders('svc-trade', INTERNAL_SECRET),
    });
    expect(live.statusCode).toBe(200);
    expect(live.json()).toEqual({ id: mine.id, parentUserId: OWNER, revoked: false });
    assertNoInventedBalance(live.json());

    await books.revokeSubAccount(OWNER, mine.id);
    const retired = await app.inject({
      method: 'GET',
      url: `/internal/sub-accounts/${mine.id}`,
      headers: serviceAuthHeaders('svc-trade', INTERNAL_SECRET),
    });
    expect(retired.statusCode).toBe(200);
    expect(retired.json()).toEqual({ id: mine.id, parentUserId: OWNER, revoked: true });
    assertNoInventedBalance(retired.json());
  });
});
