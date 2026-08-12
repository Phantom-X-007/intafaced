/**
 * Unit card (D26-P2-01g):
 * Promise: stake / unstake / buyback crash windows refuse invent through mounted
 *   tRPC public doors (createTokenRouter + signed createEdgeContext) and the
 *   S2S emissions HTTP door — not service-unit-only guards.
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
import Fastify from 'fastify';
import postgres from 'postgres';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, serviceAuthHeaders, signPrincipalHeader } from '@intafaced/contracts';
import { assertTestDatabase, postgresAvailable } from '@intafaced/db';
import { MemoryEventBus } from '@intafaced/events';
import { MemoryLedger, formatAmount, parseAmount as amt, recipes, userAvailable } from '@intafaced/ledger-client';
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
    const JULY = {
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-08-01T00:00:00.000Z',
    };

    it('recordBuyback refuses a NEW run id over an identical window — burn does not double', async () => {
      await fundRewards('4000', 'w-door-identical');
      const ops = adminCaller();

      const first = await ops.recordBuyback({
        runId: randomUUID(),
        revenueWindow: JULY,
        revenueTotal: { IFC: '1000' },
        tokensBought: '1000',
      });
      const burnedAfterFirst = amt((await ops.burnedSupply()).burned);
      expect(burnedAfterFirst).toBe(amt(first.burned));
      expect(burnedAfterFirst).toBeGreaterThan(0n);

      await expect(
        ops.recordBuyback({
          runId: randomUUID(),
          revenueWindow: JULY,
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
      expect(await sql`SELECT id FROM token.buyback_runs`).toHaveLength(1);
      expect(bus.emitted('buybackExecuted')).toHaveLength(1);
      expect(ledger.reconcile()).toEqual({ ok: true });
    });

    it('recordBuyback refuses a nested overlapping window without inventing a second burn', async () => {
      await fundRewards('4000', 'w-door-nested');
      const ops = adminCaller();

      await ops.recordBuyback({
        runId: randomUUID(),
        revenueWindow: JULY,
        revenueTotal: { IFC: '1000' },
        tokensBought: '1000',
      });
      const burnedAfterFirst = amt((await ops.burnedSupply()).burned);

      await expect(
        ops.recordBuyback({
          runId: randomUUID(),
          revenueWindow: {
            from: '2026-07-10T00:00:00.000Z',
            to: '2026-07-20T00:00:00.000Z',
          },
          revenueTotal: { IFC: '1000' },
          tokensBought: '1000',
        }),
      ).rejects.toMatchObject({
        code: 'CONFLICT',
        cause: { code: 'token.buyback_window_overlap' },
      });

      expect(amt((await ops.burnedSupply()).burned)).toBe(burnedAfterFirst);
      expect(await sql`SELECT id FROM token.buyback_runs`).toHaveLength(1);
    });

    it('recordBuyback refuses tokensBought=0 before claiming the window — later real burn stays free', async () => {
      const ops = adminCaller();
      const window = {
        from: '2026-10-01T00:00:00.000Z',
        to: '2026-10-08T00:00:00.000Z',
      };

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

      expect(await sql`SELECT id FROM token.buyback_runs`).toHaveLength(0);
      expect(amt((await ops.burnedSupply()).burned)).toBe(0n);

      await fundRewards('500', 'w-door-zero-then-real');
      const real = await ops.recordBuyback({
        runId: randomUUID(),
        revenueWindow: window,
        revenueTotal: { IFC: '500' },
        tokensBought: '500',
      });
      expect(amt(real.burned) + amt(real.toRewards)).toBe(amt('500'));
      expect(amt((await ops.burnedSupply()).burned)).toBe(amt(real.burned));
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

      await expect(
        ops.recordBuyback({
          runId: randomUUID(),
          revenueWindow: JULY,
          revenueTotal: { IFC: '-999' },
          tokensBought: '100',
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

      expect(await sql`SELECT id FROM token.buyback_runs`).toHaveLength(0);
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
      const mintNextEpoch = vi.fn(async () => ({ epoch: 0, minted: amt('136000') }));
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
  });
}
