/**
 * Unit card (D26-P2-01g):
 * Promise: stake / unstake / buyback crash windows refuse invent through mounted
 *   Fastify tRPC public doors (`/trpc` + signed createEdgeContext) and the
 *   S2S emissions HTTP door wired to TokenService.mintNextEpoch — not
 *   createCaller-only or stub-mint theater.
 * Break: underfunded stake could invent an active row; locked unstake could
 *   invent a return of principal; overlapping buyback windows could invent a
 *   second burn after the irreversible leg; zero tokensBought / bad revenue
 *   could spend the window claim; mint could invent supply when emissions are off;
 *   yield over-claim could invent fees that were never in houseFees.
 * Done bar:
 *   · stake over available → BAD_REQUEST; zero stake rows; available untouched.
 *   · unstake locked m12 → BAD_REQUEST / token.stake_locked; principal still staked.
 *   · recordBuyback overlapping window → CONFLICT / token.buyback_window_overlap;
 *     burn account does not double (read the burn, not only the exception).
 *   · tokensBought=0 / invalid revenueTotal refuse before claim — window free later.
 *   · mintEpoch + POST /internal/emissions/mint-next refuse when emissions off.
 *   · distributeRevenue over houseFees → BAD_REQUEST / token.yield_source_underfunded.
 * Class: N (honesty) / M surface (no invent emission/buyback §8 numbers — P0-04).
 * Leverage: createTokenRouter + TokenService + MemoryLedger + registerInternalEmissions
 *   (Phase A — deepen existing token doors, no rebuild).
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import postgres from 'postgres';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, serviceAuthHeaders, signPrincipalHeader } from '@intafaced/contracts';
import { assertTestDatabase, postgresAvailable } from '@intafaced/db';
import { MemoryEventBus } from '@intafaced/events';
import { MemoryLedger, formatAmount, houseFees, parseAmount as amt, recipes, userAvailable } from '@intafaced/ledger-client';
import { DEFAULT_BUYBACK_PARAMS } from './economics/buyback.js';
import { DEFAULT_EMISSION_PARAMS } from './economics/emission.js';
import { registerInternalEmissions } from './internal-emissions.js';
import { createTokenRouter } from './router.js';
import { TokenService } from './token-service.js';

const SECRET = 'token-promise-falsify-public-doors-secret-32';
const USER = '11111111-1111-4111-8111-111111111111';
const OPERATOR = '33333333-3333-4333-8333-333333333333';
const INTERNAL_SECRET = 'token-promise-falsify-internal-emissions-secret';

const URL = process.env.TEST_DATABASE_URL_TOKEN ?? 'postgres://svc_token:svc_token@localhost:5433/intafaced_test';
const here = dirname(fileURLToPath(import.meta.url));
const drizzle = join(here, '..', 'drizzle');
const MIGRATIONS = [
  '0000_token_init.sql',
  '0001_stake_pending.sql',
  '0002_buyback_window_claim.sql',
  '0003_yield_window_plan.sql',
  '0004_yield_window_header.sql',
].map((f) => readFileSync(join(drizzle, f), 'utf8'));

const available = await postgresAvailable(URL);

if (!available) {
  describe.skip('D26-P2-01g public doors (Postgres unavailable)', () => {
    it('skipped', () => undefined);
  });
} else {
  const sql = postgres(URL, {
    max: 8,
    connection: { search_path: 'token,public', application_name: 'svc-token-promise-falsify' },
    onnotice: () => undefined,
  });

  await assertTestDatabase(sql, 'svc-token');
  for (const migration of MIGRATIONS) {
    await sql.unsafe(migration);
  }

  const edgeContext = createEdgeContext({ secret: SECRET, serviceName: 'svc-token' });

  let ledger: MemoryLedger;
  let bus: MemoryEventBus;
  let token: TokenService;

  const options = {
    assetId: 'IFC',
    emission: DEFAULT_EMISSION_PARAMS,
    buyback: DEFAULT_BUYBACK_PARAMS,
    loadParamsFromDb: false,
    feeScheduleTtlMs: 0,
  };

  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  function principal(overrides: Partial<Principal> = {}): Principal {
    return {
      sub: USER,
      userId: USER,
      sid: '22222222-2222-4222-8222-222222222222',
      scopes: ['token:read', 'token:stake'],
      tier: 'full',
      mfa: true,
      expiresAt: new Date(Date.now() + 60_000),
      ...overrides,
    } as Principal;
  }

  function caller(p: Principal = principal()) {
    const raw = encodePrincipal(p);
    return createTokenRouter(token, { emissionsEnabled: true }).createCaller(
      edgeContext({
        headers: {
          'x-intafaced-principal': raw,
          'x-intafaced-principal-sig': signPrincipalHeader(raw, SECRET, 'DE'),
          'x-intafaced-region': 'DE',
        },
        id: `req-${randomUUID()}`,
      }),
    );
  }

  type WireBody = {
    result?: { data?: { json?: unknown } | unknown };
    error?: {
      message?: string;
      data?: { code?: string; httpStatus?: number; cause?: { code?: string } };
    };
  };

  function signedHeaders(p: Principal = principal()): Record<string, string> {
    const raw = encodePrincipal(p);
    return {
      'x-intafaced-principal': raw,
      'x-intafaced-principal-sig': signPrincipalHeader(raw, SECRET, 'DE'),
      'x-intafaced-region': 'DE',
      'content-type': 'application/json',
    };
  }

  function adminHeaders(): Record<string, string> {
    return signedHeaders(
      principal({
        sub: OPERATOR,
        userId: OPERATOR,
        scopes: ['admin:treasury', 'token:read'],
        mfa: true,
      }),
    );
  }

  async function mountDoors(emissionsEnabled = true): Promise<FastifyInstance> {
    const tokenRouter = createTokenRouter(token, { emissionsEnabled });
    const app = Fastify({ logger: false });
    registerInternalEmissions(app, {
      internalSecret: INTERNAL_SECRET,
      emissionsEnabled,
      mintNextEpoch: () => token.mintNextEpoch(),
    });
    await app.register(fastifyTRPCPlugin, {
      prefix: '/trpc',
      trpcOptions: {
        router: tokenRouter,
        createContext: ({ req }) => edgeContext({ headers: req.headers, id: req.id }),
      } satisfies FastifyTRPCPluginOptions<typeof tokenRouter>['trpcOptions'],
    });
    await app.ready();
    return app;
  }

  async function trpcMutate(
    app: FastifyInstance,
    path: string,
    input: Record<string, unknown>,
    headers: Record<string, string>,
  ): Promise<{ statusCode: number; body: WireBody }> {
    const res = await app.inject({ method: 'POST', url: `/trpc/${path}`, headers, payload: input });
    return { statusCode: res.statusCode, body: res.json() as WireBody };
  }

  function wireJson(body: WireBody): unknown {
    const data = body.result?.data;
    if (data && typeof data === 'object' && data !== null && 'json' in data) {
      return (data as { json: unknown }).json;
    }
    return data;
  }

  /** Unique half-open window per test — avoids GiST races with sibling files. */
  function uniqueWindow(tag: string): { from: string; to: string } {
    let h = 0;
    for (let i = 0; i < tag.length; i += 1) h = (h * 33 + tag.charCodeAt(i)) >>> 0;
    const day = (h % 300) + 1;
    const from = new Date(Date.UTC(2030, 0, 1, 0, 0, 0) + day * 86_400_000);
    const to = new Date(from.getTime() + 7 * 86_400_000);
    return { from: from.toISOString(), to: to.toISOString() };
  }

  function adminCaller(emissionsEnabled = true) {
    const raw = encodePrincipal(
      principal({
        sub: OPERATOR,
        userId: OPERATOR,
        scopes: ['admin:treasury', 'token:read'],
        mfa: true,
      }),
    );
    return createTokenRouter(token, { emissionsEnabled }).createCaller(
      edgeContext({
        headers: {
          'x-intafaced-principal': raw,
          'x-intafaced-principal-sig': signPrincipalHeader(raw, SECRET, 'DE'),
          'x-intafaced-region': 'DE',
        },
        id: `req-admin-${randomUUID()}`,
      }),
    );
  }

  async function fund(userId: string, amount: string) {
    await ledger.post(
      recipes.deposit({
        userId,
        assetId: 'IFC',
        amount: amt(amount),
        rail: 'test',
        railRef: `${userId}:${amount}:${randomUUID()}`,
      }),
    );
  }

  async function accrueFees(module: string, amount: string) {
    const payer = '99999999-9999-4999-8999-999999999999';
    await fund(payer, amount);
    await ledger.post(
      recipes.feeCharge({
        chargeId: `${module}:${randomUUID()}`,
        userId: payer,
        module,
        mode: 'asset',
        assetId: 'IFC',
        amount: amt(amount),
      }),
    );
  }

  async function fundRewards(amount: string, windowId: string) {
    await accrueFees('trade', amount);
    await token.distributeRevenue({ windowId, sources: [{ module: 'trade', amount: amt(amount) }] });
  }

  const balanceOf = async (userId: string) => formatAmount((await ledger.balance(userAvailable(userId, 'IFC'))).amount);
  const stakedOf = async (userId: string) => {
    const all = await ledger.balances('user', userId);
    const total = all.filter((b) => b.account.kind === 'stake' && b.account.assetId === 'IFC').reduce((acc, b) => acc + b.amount, 0n);
    return formatAmount(total);
  };

  beforeEach(async () => {
    await sql`
      TRUNCATE token.governance_votes, token.proposals, token.stakes, token.buyback_runs,
               token.emission_epochs, token.yield_payouts, token.yield_windows
      RESTART IDENTITY CASCADE
    `;
    ledger = new MemoryLedger();
    bus = new MemoryEventBus('svc-token');
    token = new TokenService(sql, ledger, bus, options);
  });

  describe('D26-P2-01g public doors — stake refuse invent funding', () => {
    it('stake refuses over available — invents no active row and leaves principal untouched', async () => {
      await fund(USER, '100');
      const api = caller();

      await expect(api.stake({ amount: '101', tier: 'flex' })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });

      const rows = await sql`SELECT id, status FROM token.stakes`;
      expect(rows).toHaveLength(0);
      expect(await balanceOf(USER)).toBe('100');
      expect(await stakedOf(USER)).toBe('0');
      expect(await token.stakeOf(USER)).toBe(0n);
    });

    it('stake refuses a non-positive amount at the door before the service runs', async () => {
      await fund(USER, '100');
      const stake = vi.spyOn(token, 'stake');

      await expect(caller().stake({ amount: '0', tier: 'flex' })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });
      expect(stake).not.toHaveBeenCalled();
      expect(await balanceOf(USER)).toBe('100');
    });
  });

  describe('D26-P2-01g public doors — unstake refuse invent unlock', () => {
    it('unstake refuses a locked m12 stake by name and invents no principal return', async () => {
      await fund(USER, '1000');
      const api = caller();
      const opened = await api.stake({ amount: '1000', tier: 'm12' });
      expect(opened.status).toBe('active');
      expect(await stakedOf(USER)).toBe('1000');
      expect(await balanceOf(USER)).toBe('0');

      await expect(api.unstake({ stakeId: opened.id })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        cause: { code: 'token.stake_locked' },
      });

      expect(await balanceOf(USER)).toBe('0');
      expect(await stakedOf(USER)).toBe('1000');
      const [row] = await sql<Array<{ status: string }>>`
        SELECT status FROM token.stakes WHERE id = ${opened.id}
      `;
      expect(row?.status).toBe('active');
    });
  });

  describe('D26-P2-01g public doors — buyback crash windows', () => {
    it('recordBuyback refuses a NEW run id over an identical window — burn does not double', async () => {
      await fundRewards('4000', 'w-door-identical');
      const ops = adminCaller();
      const window = uniqueWindow('identical');
      const firstId = randomUUID();

      const first = await ops.recordBuyback({
        runId: firstId,
        revenueWindow: window,
        revenueTotal: { IFC: '1000' },
        tokensBought: '1000',
      });
      const burnedAfterFirst = amt((await ops.burnedSupply()).burned);
      expect(burnedAfterFirst).toBe(amt(first.burned));
      expect(burnedAfterFirst).toBeGreaterThan(0n);

      await expect(
        ops.recordBuyback({
          runId: randomUUID(),
          revenueWindow: window,
          revenueTotal: { IFC: '1000' },
          tokensBought: '1000',
        }),
      ).rejects.toMatchObject({
        code: 'CONFLICT',
        cause: { code: 'token.buyback_window_overlap' },
      });

      // THE POINT — read the burn account, not only the exception name.
      expect(amt((await ops.burnedSupply()).burned)).toBe(burnedAfterFirst);
      expect(amt((await ops.burnedSupply()).burned)).not.toBe(burnedAfterFirst * 2n);
      expect(await sql`SELECT id FROM token.buyback_runs WHERE id = ${firstId}`).toHaveLength(1);
      expect(bus.emitted('buybackExecuted')).toHaveLength(1);
      expect(ledger.reconcile()).toEqual({ ok: true });
    });

    it('recordBuyback refuses a nested overlapping window without inventing a second burn', async () => {
      await fundRewards('4000', 'w-door-nested');
      const ops = adminCaller();
      const outer = uniqueWindow('nested');
      const outerFrom = new Date(outer.from);
      const nested = {
        from: new Date(outerFrom.getTime() + 2 * 86_400_000).toISOString(),
        to: new Date(outerFrom.getTime() + 4 * 86_400_000).toISOString(),
      };
      const firstId = randomUUID();

      await ops.recordBuyback({
        runId: firstId,
        revenueWindow: outer,
        revenueTotal: { IFC: '1000' },
        tokensBought: '1000',
      });
      const burnedAfterFirst = amt((await ops.burnedSupply()).burned);

      await expect(
        ops.recordBuyback({
          runId: randomUUID(),
          revenueWindow: nested,
          revenueTotal: { IFC: '1000' },
          tokensBought: '1000',
        }),
      ).rejects.toMatchObject({
        code: 'CONFLICT',
        cause: { code: 'token.buyback_window_overlap' },
      });

      expect(amt((await ops.burnedSupply()).burned)).toBe(burnedAfterFirst);
      expect(await sql`SELECT id FROM token.buyback_runs WHERE id = ${firstId}`).toHaveLength(1);
    });

    it('recordBuyback refuses tokensBought=0 before claiming the window — later real burn stays free', async () => {
      const ops = adminCaller();
      const window = uniqueWindow('zero');

      await expect(
        ops.recordBuyback({
          runId: randomUUID(),
          revenueWindow: window,
          revenueTotal: { IFC: '0' },
          tokensBought: '0',
        }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        cause: { code: 'token.buyback_revenue_invalid' },
      });

      expect(
        await sql`
          SELECT id FROM token.buyback_runs
           WHERE revenue_window_from = ${new Date(window.from)}
             AND revenue_window_to = ${new Date(window.to)}
        `,
      ).toHaveLength(0);
      expect(amt((await ops.burnedSupply()).burned)).toBe(0n);

      await fundRewards('500', 'w-door-zero-then-real');
      const realId = randomUUID();
      const real = await ops.recordBuyback({
        runId: realId,
        revenueWindow: window,
        revenueTotal: { IFC: '500' },
        tokensBought: '500',
      });
      expect(amt(real.burned) + amt(real.toRewards)).toBe(amt('500'));
      expect(amt((await ops.burnedSupply()).burned)).toBe(amt(real.burned));
      expect(await sql`SELECT id FROM token.buyback_runs WHERE id = ${realId}`).toHaveLength(1);
    });

    it('recordBuyback refuses a non-ordered window at the door — service never claims', async () => {
      const record = vi.spyOn(token, 'recordBuyback');
      const ops = adminCaller();

      await expect(
        ops.recordBuyback({
          runId: randomUUID(),
          revenueWindow: {
            from: '2026-08-01T00:00:00.000Z',
            to: '2026-07-01T00:00:00.000Z',
          },
          revenueTotal: { IFC: '1000' },
          tokensBought: '100',
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

      expect(record).not.toHaveBeenCalled();
      expect(await sql`SELECT id FROM token.buyback_runs`).toHaveLength(0);
    });

    it('recordBuyback refuses invented negative revenueTotal before any claim row', async () => {
      const ops = adminCaller();
      const window = uniqueWindow('negative-revenue');

      await expect(
        ops.recordBuyback({
          runId: randomUUID(),
          revenueWindow: window,
          revenueTotal: { IFC: '-999' },
          tokensBought: '100',
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

      expect(
        await sql`
          SELECT id FROM token.buyback_runs
           WHERE revenue_window_from = ${new Date(window.from)}
             AND revenue_window_to = ${new Date(window.to)}
        `,
      ).toHaveLength(0);
      expect(amt((await ops.burnedSupply()).burned)).toBe(0n);
    });
  });

  describe('D26-P2-01g public doors — yield refuse invent fees', () => {
    it('distributeRevenue refuses over-claim of houseFees by name — no invent sweep', async () => {
      await accrueFees('trade', '100');
      const ops = adminCaller();

      await expect(
        ops.distributeRevenue({
          windowId: 'w-door-underfund',
          sources: [{ module: 'trade', amount: '101' }],
        }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        cause: { code: 'token.yield_source_underfunded' },
      });

      expect(await sql`SELECT window_id FROM token.yield_windows`).toHaveLength(0);
      expect(await sql`SELECT window_id FROM token.yield_payouts`).toHaveLength(0);
      expect(formatAmount((await ledger.balance(houseFees('trade', 'IFC'))).amount)).toBe('100');
    });
  });

  describe('D26-P2-01g public doors — emissions refuse invent mint', () => {
    it('mintEpoch refuses when emissions are disabled — no invent supply', async () => {
      const mintNext = vi.spyOn(token, 'mintNextEpoch');
      const mintEpoch = vi.spyOn(token, 'mintEpoch');
      const ops = adminCaller(false);

      await expect(ops.mintEpoch({})).rejects.toMatchObject({
        code: 'PRECONDITION_FAILED',
      });
      expect(mintNext).not.toHaveBeenCalled();
      expect(mintEpoch).not.toHaveBeenCalled();
      expect(await sql`SELECT epoch FROM token.emission_epochs`).toHaveLength(0);
    });

    it('POST /internal/emissions/mint-next refuses when emissions are disabled — kill-switch door', async () => {
      const mintNextEpoch = vi.fn(async () => ({ epoch: 0, minted: amt('1') }));
      const app = Fastify({ logger: false });
      registerInternalEmissions(app, {
        internalSecret: INTERNAL_SECRET,
        emissionsEnabled: false,
        mintNextEpoch,
      });
      await app.ready();

      const res = await app.inject({
        method: 'POST',
        url: '/internal/emissions/mint-next',
        headers: serviceAuthHeaders('svc-cron', INTERNAL_SECRET),
      });

      expect(res.statusCode).toBe(503);
      expect(res.json().code).toBe('token.emissions_disabled');
      expect(mintNextEpoch).not.toHaveBeenCalled();
      await app.close();
    });

    it('POST /internal/emissions/mint-next with TokenService wired does not invent an epoch row', async () => {
      const mintNext = vi.spyOn(token, 'mintNextEpoch');
      const app = await mountDoors(false);

      const res = await app.inject({
        method: 'POST',
        url: '/internal/emissions/mint-next',
        headers: serviceAuthHeaders('svc-cron', INTERNAL_SECRET),
      });

      expect(res.statusCode).toBe(503);
      expect(res.json().code).toBe('token.emissions_disabled');
      expect(mintNext).not.toHaveBeenCalled();
      expect(await sql`SELECT epoch FROM token.emission_epochs`).toHaveLength(0);
      await app.close();
    });
  });

  describe('D26-P2-01g mounted Fastify tRPC doors', () => {
    it('POST /trpc/stake refuses over available — invents no row', async () => {
      await fund(USER, '100');
      const app = await mountDoors();

      const { statusCode, body } = await trpcMutate(app, 'stake', { amount: '101', tier: 'flex' }, signedHeaders());

      expect(statusCode).toBe(400);
      expect(body.error?.data?.code).toBe('BAD_REQUEST');
      expect(await sql`SELECT id FROM token.stakes`).toHaveLength(0);
      expect(await balanceOf(USER)).toBe('100');
      expect(await stakedOf(USER)).toBe('0');
      await app.close();
    });

    it('POST /trpc/unstake refuses a locked m12 stake and keeps principal staked', async () => {
      await fund(USER, '1000');
      const app = await mountDoors();
      const opened = await trpcMutate(app, 'stake', { amount: '1000', tier: 'm12' }, signedHeaders());
      expect(opened.statusCode).toBe(200);
      const stake = wireJson(opened.body) as { id: string; status: string };
      expect(stake.status).toBe('active');
      expect(await stakedOf(USER)).toBe('1000');
      expect(await balanceOf(USER)).toBe('0');

      const refused = await trpcMutate(app, 'unstake', { stakeId: stake.id }, signedHeaders());
      expect(refused.statusCode).toBe(400);
      expect(refused.body.error?.data?.code).toBe('BAD_REQUEST');
      expect(refused.body.error?.data?.cause?.code ?? refused.body.error?.message).toMatch(/stake_locked|locked/i);

      expect(await balanceOf(USER)).toBe('0');
      expect(await stakedOf(USER)).toBe('1000');
      const [row] = await sql<Array<{ status: string }>>`SELECT status FROM token.stakes WHERE id = ${stake.id}`;
      expect(row?.status).toBe('active');
      await app.close();
    });

    it('POST /trpc/unstake concurrent crash does not double-return principal', async () => {
      await fund(USER, '1000');
      const app = await mountDoors();
      const opened = await trpcMutate(app, 'stake', { amount: '1000', tier: 'flex' }, signedHeaders());
      const stake = wireJson(opened.body) as { id: string };

      const results = await Promise.all(
        Array.from({ length: 8 }, () => trpcMutate(app, 'unstake', { stakeId: stake.id }, signedHeaders())),
      );

      expect(results.filter((r) => r.statusCode === 200)).toHaveLength(1);
      expect(await balanceOf(USER)).toBe('1000');
      expect(await stakedOf(USER)).toBe('0');
      await app.close();
    });

    it('POST /trpc/recordBuyback overlapping crash does not double-burn', async () => {
      await fundRewards('4000', 'w-mounted-identical');
      const app = await mountDoors();
      const window = uniqueWindow('mounted-identical');
      const firstId = randomUUID();

      const first = await trpcMutate(
        app,
        'recordBuyback',
        { runId: firstId, revenueWindow: window, revenueTotal: { IFC: '1000' }, tokensBought: '1000' },
        adminHeaders(),
      );
      expect(first.statusCode).toBe(200);
      const firstWire = wireJson(first.body) as { burned: string };
      const burnedAfterFirst = amt(firstWire.burned);
      expect(burnedAfterFirst).toBeGreaterThan(0n);
      expect(await token.burnedSupply()).toBe(burnedAfterFirst);

      const second = await trpcMutate(
        app,
        'recordBuyback',
        {
          runId: randomUUID(),
          revenueWindow: window,
          revenueTotal: { IFC: '1000' },
          tokensBought: '1000',
        },
        adminHeaders(),
      );
      expect(second.statusCode).toBe(409);
      expect(second.body.error?.data?.code).toBe('CONFLICT');

      expect(await token.burnedSupply()).toBe(burnedAfterFirst);
      expect(await token.burnedSupply()).not.toBe(burnedAfterFirst * 2n);
      expect(await sql`SELECT id FROM token.buyback_runs WHERE id = ${firstId}`).toHaveLength(1);
      expect(bus.emitted('buybackExecuted')).toHaveLength(1);
      expect(ledger.reconcile()).toEqual({ ok: true });
      await app.close();
    });

    it('POST /trpc/recordBuyback concurrent same-window crash burns once', async () => {
      await fundRewards('4000', 'w-mounted-concurrent');
      const app = await mountDoors();
      const window = uniqueWindow('mounted-concurrent');
      const a = randomUUID();
      const b = randomUUID();

      const [left, right] = await Promise.all([
        trpcMutate(
          app,
          'recordBuyback',
          { runId: a, revenueWindow: window, revenueTotal: { IFC: '1000' }, tokensBought: '1000' },
          adminHeaders(),
        ),
        trpcMutate(
          app,
          'recordBuyback',
          { runId: b, revenueWindow: window, revenueTotal: { IFC: '1000' }, tokensBought: '1000' },
          adminHeaders(),
        ),
      ]);

      const codes = [left.statusCode, right.statusCode].sort((x, y) => x - y);
      expect(codes).toEqual([200, 409]);
      const winner = left.statusCode === 200 ? left : right;
      const burnedOnce = amt((wireJson(winner.body) as { burned: string }).burned);
      expect(burnedOnce).toBeGreaterThan(0n);

      expect(await token.burnedSupply()).toBe(burnedOnce);
      expect(await sql`SELECT id FROM token.buyback_runs`).toHaveLength(1);
      expect(bus.emitted('buybackExecuted')).toHaveLength(1);
      expect(ledger.reconcile()).toEqual({ ok: true });
      await app.close();
    });

    it('POST /trpc/recordBuyback tail-overlap refuses without a second burn', async () => {
      await fundRewards('4000', 'w-mounted-tail');
      const app = await mountDoors();
      const outer = uniqueWindow('mounted-tail');
      const outerFrom = new Date(outer.from);
      const tail = {
        from: new Date(outerFrom.getTime() + 6 * 86_400_000).toISOString(),
        to: new Date(outerFrom.getTime() + 10 * 86_400_000).toISOString(),
      };
      const firstId = randomUUID();

      const first = await trpcMutate(
        app,
        'recordBuyback',
        { runId: firstId, revenueWindow: outer, revenueTotal: { IFC: '1000' }, tokensBought: '1000' },
        adminHeaders(),
      );
      expect(first.statusCode).toBe(200);
      const burnedAfterFirst = amt((wireJson(first.body) as { burned: string }).burned);

      const second = await trpcMutate(
        app,
        'recordBuyback',
        { runId: randomUUID(), revenueWindow: tail, revenueTotal: { IFC: '1000' }, tokensBought: '1000' },
        adminHeaders(),
      );
      expect(second.statusCode).toBe(409);

      expect(await token.burnedSupply()).toBe(burnedAfterFirst);
      expect(await sql`SELECT id FROM token.buyback_runs`).toHaveLength(1);
      await app.close();
    });

    it('POST /trpc/recordBuyback same runId on a different window refuses without a second burn', async () => {
      await fundRewards('4000', 'w-mounted-runid');
      const app = await mountDoors();
      const firstWindow = uniqueWindow('mounted-runid');
      const runId = randomUUID();

      const first = await trpcMutate(
        app,
        'recordBuyback',
        { runId, revenueWindow: firstWindow, revenueTotal: { IFC: '1000' }, tokensBought: '1000' },
        adminHeaders(),
      );
      expect(first.statusCode).toBe(200);
      const burnedAfterFirst = amt((wireJson(first.body) as { burned: string }).burned);

      const other = uniqueWindow('mounted-runid-other');
      const second = await trpcMutate(
        app,
        'recordBuyback',
        { runId, revenueWindow: other, revenueTotal: { IFC: '1000' }, tokensBought: '1000' },
        adminHeaders(),
      );
      expect(second.statusCode).toBe(409);
      expect(second.body.error?.data?.code).toBe('CONFLICT');

      expect(await token.burnedSupply()).toBe(burnedAfterFirst);
      expect(await sql`SELECT id FROM token.buyback_runs`).toHaveLength(1);
      await app.close();
    });

    it('POST /trpc/recordBuyback recovers a pending crash without double-burning', async () => {
      await fundRewards('2000', 'w-mounted-pending');
      const app = await mountDoors();
      const window = uniqueWindow('mounted-pending');
      const runId = randomUUID();

      await sql`
        INSERT INTO token.buyback_runs (
          id, revenue_window_from, revenue_window_to, revenue_total,
          tokens_bought, tokens_burned, tokens_to_rewards, status
        ) VALUES (
          ${runId}, ${new Date(window.from)}, ${new Date(window.to)}, ${sql.json({ IFC: '1000' } as never)},
          1000::numeric, 0::numeric, 0::numeric, 'pending'
        )
      `;

      const retry = await trpcMutate(
        app,
        'recordBuyback',
        { runId, revenueWindow: window, revenueTotal: { IFC: '1000' }, tokensBought: '1000' },
        adminHeaders(),
      );
      expect(retry.statusCode).toBe(200);
      const burnedOnce = amt((wireJson(retry.body) as { burned: string }).burned);
      expect(burnedOnce).toBeGreaterThan(0n);
      expect(await token.burnedSupply()).toBe(burnedOnce);

      const again = await trpcMutate(
        app,
        'recordBuyback',
        { runId: randomUUID(), revenueWindow: window, revenueTotal: { IFC: '1000' }, tokensBought: '1000' },
        adminHeaders(),
      );
      expect(again.statusCode).toBe(409);
      expect(await token.burnedSupply()).toBe(burnedOnce);
      await app.close();
    });

    it('POST /trpc/distributeRevenue over-claim leaves houseFees untouched', async () => {
      await accrueFees('trade', '100');
      const app = await mountDoors();

      const refused = await trpcMutate(
        app,
        'distributeRevenue',
        { windowId: 'w-mounted-underfund', sources: [{ module: 'trade', amount: '101' }] },
        adminHeaders(),
      );
      expect(refused.statusCode).toBe(400);
      expect(refused.body.error?.data?.code).toBe('BAD_REQUEST');
      expect(refused.body.error?.data?.cause?.code ?? refused.body.error?.message).toMatch(/yield_source_underfunded|underfund/i);
      expect(await sql`SELECT window_id FROM token.yield_windows`).toHaveLength(0);
      expect(await sql`SELECT window_id FROM token.yield_payouts`).toHaveLength(0);
      expect(formatAmount((await ledger.balance(houseFees('trade', 'IFC'))).amount)).toBe('100');
      await app.close();
    });

    it('POST /trpc/mintEpoch refuses when emissions are off — no invent supply', async () => {
      const mintNext = vi.spyOn(token, 'mintNextEpoch');
      const mintEpoch = vi.spyOn(token, 'mintEpoch');
      const app = await mountDoors(false);

      const refused = await trpcMutate(app, 'mintEpoch', {}, adminHeaders());
      expect(refused.statusCode).toBe(412);
      expect(refused.body.error?.data?.code).toBe('PRECONDITION_FAILED');
      expect(mintNext).not.toHaveBeenCalled();
      expect(mintEpoch).not.toHaveBeenCalled();
      expect(await sql`SELECT epoch FROM token.emission_epochs`).toHaveLength(0);
      await app.close();
    });
  });
}
