import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { assertTestDatabase, postgresAvailable } from '@intafaced/db';
import { describe, expect, it, beforeEach, afterEach, afterAll } from 'vitest';
import { trace } from '@opentelemetry/api';
import { MemoryEventBus } from '@intafaced/events';
import {
  MemoryLedger,
  formatAmount,
  parseAmount as amt,
  recipes,
  burnAccount,
  houseFees,
  rewardsEngine,
  userAvailable,
} from '@intafaced/ledger-client';
import { TokenService, TokenError, foldTally } from './token-service.js';
import { DEFAULT_EMISSION_PARAMS } from './economics/emission.js';
import { DEFAULT_BUYBACK_PARAMS } from './economics/buyback.js';

/**
 * svc-token money paths.
 *
 * The ledger here is `MemoryLedger` — the reference implementation, which the
 * conformance suite proves behaves identically to svc-ledger's Postgres engine
 * (§4.4). That equivalence is what makes it legitimate to use here: these tests
 * are about svc-token's recipes and ordering, not about the ledger.
 *
 * Postgres is real, because the stake row / ledger interaction is exactly where
 * a bug would hide.
 */

const URL = process.env.TEST_DATABASE_URL_TOKEN ?? 'postgres://svc_token:svc_token@localhost:5433/intafaced_test';
const here = dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(join(here, '..', 'drizzle', '0000_token_init.sql'), 'utf8');
const migrationPending = readFileSync(join(here, '..', 'drizzle', '0001_stake_pending.sql'), 'utf8');
const migrationBuybackClaim = readFileSync(join(here, '..', 'drizzle', '0002_buyback_window_claim.sql'), 'utf8');
const migrationYieldPlan = readFileSync(join(here, '..', 'drizzle', '0003_yield_window_plan.sql'), 'utf8');
const migrationYieldHeader = readFileSync(join(here, '..', 'drizzle', '0004_yield_window_header.sql'), 'utf8');

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const USER_C = '33333333-3333-4333-8333-333333333333';

/**
 * The Postgres probe comes from `@intafaced/db` on purpose.
 *
 * This file used to open its own two-line `reachable()`. That helper swallowed
 * every error and returned `false` regardless of `CI` or `REQUIRE_POSTGRES=1`,
 * so on CI — where an unreachable database is supposed to be a hard failure —
 * this money suite would have skipped in silence and been counted as a pass.
 * Five suites carried the same private probe and the same hole.
 *
 * `postgresAvailable` is the one probe that honours `postgresRequired()`, and it
 * journals its decision so `pnpm verify` can name what did not run instead of
 * letting turbo's "N successful" imply that everything did.
 * (`tooling/ci/skip-honesty-scan.mjs` fails a build that re-adds a private probe.)
 */
const available = await postgresAvailable(URL);

if (!available) {
  describe.skip('svc-token (Postgres unavailable — start docker compose)', () => {
    it('skipped', () => undefined);
  });
} else {
  const sql = postgres(URL, {
    max: 8,
    connection: { search_path: 'token,public', application_name: 'svc-token-test' },
    onnotice: () => undefined,
  });

  // Owns its database, or does not run. Must precede the first migration.
  await assertTestDatabase(sql, 'svc-token');

  await sql.unsafe(migration);
  await sql.unsafe(migrationPending);
  await sql.unsafe(migrationBuybackClaim);
  await sql.unsafe(migrationYieldPlan);
  await sql.unsafe(migrationYieldHeader);

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

  /** Put real IFC in a user's available balance so a stake has something behind it. */
  async function fund(userId: string, amount: string) {
    await ledger.post(
      recipes.deposit({ userId, assetId: 'IFC', amount: amt(amount), rail: 'test', railRef: `${userId}:${amount}:${Math.random()}` }),
    );
  }

  /** Accrue fees into a module's house account, the way a real fee charge would. */
  async function accrueFees(module: string, amount: string) {
    const payer = '99999999-9999-4999-8999-999999999999';
    await fund(payer, amount);
    await ledger.post(
      recipes.feeCharge({
        chargeId: `${module}:${Math.random()}`,
        userId: payer,
        module,
        mode: 'asset',
        assetId: 'IFC',
        amount: amt(amount),
      }),
    );
  }

  const balanceOf = async (userId: string) => formatAmount((await ledger.balance(userAvailable(userId, 'IFC'))).amount);
  const stakedOf = async (userId: string) => {
    const all = await ledger.balances('user', userId);
    const total = all.filter((b) => b.account.kind === 'stake' && b.account.assetId === 'IFC').reduce((acc, b) => acc + b.amount, 0n);
    return formatAmount(total);
  };

  beforeEach(async () => {
    await sql`TRUNCATE token.governance_votes, token.proposals, token.stakes, token.buyback_runs, token.emission_epochs, token.yield_payouts, token.yield_windows RESTART IDENTITY CASCADE`;
    ledger = new MemoryLedger();
    bus = new MemoryEventBus('svc-token');
    token = new TokenService(sql, ledger, bus, options);
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  // ── Staking ───────────────────────────────────────────────────────────────

  describe('staking', () => {
    it('moves value into the ledger stake account and records the stake', async () => {
      await fund(USER_A, '10000');
      const stake = await token.stake({ userId: USER_A, amount: amt('4000'), tier: 'm12' });

      expect(await balanceOf(USER_A)).toBe('6000');
      expect(await stakedOf(USER_A)).toBe('4000');

      const rows = await sql<Array<{ id: string; status: string; tier: string }>>`SELECT id, status, tier FROM token.stakes`;
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ id: stake.id, status: 'active', tier: 'm12' });
    });

    it('refuses to stake more than the user holds', async () => {
      await fund(USER_A, '100');
      await expect(token.stake({ userId: USER_A, amount: amt('101'), tier: 'flex' })).rejects.toThrow();

      // L3-2: pending claim is deleted when ledger refuses — no stake row left
      // (and never an active unfunded stake).
      const rows = await sql`SELECT id FROM token.stakes`;
      expect(rows).toHaveLength(0);
    });

    it('L3-2 activates a pending claim after ledger funds it (retry-safe)', async () => {
      await fund(USER_A, '5000');
      const stakeId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      const stake = await token.stake({ userId: USER_A, amount: amt('1000'), tier: 'flex', stakeId });
      expect(stake.status).toBe('active');
      // Idempotent re-entry with same stakeId: ledger no-op, still active.
      const again = await token.stake({ userId: USER_A, amount: amt('1000'), tier: 'flex', stakeId });
      expect(again.id).toBe(stakeId);
      expect(await stakedOf(USER_A)).toBe('1000');
      const rows = await sql<Array<{ status: string }>>`SELECT status FROM token.stakes WHERE id = ${stakeId}`;
      expect(rows[0]?.status).toBe('active');
    });

    it('M-01 refuses stakeId reuse with a different amount or user', async () => {
      await fund(USER_A, '5000');
      await fund(USER_B, '5000');
      const stakeId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
      await token.stake({ userId: USER_A, amount: amt('1000'), tier: 'flex', stakeId });

      await expect(token.stake({ userId: USER_A, amount: amt('2000'), tier: 'flex', stakeId })).rejects.toMatchObject({
        code: 'token.stake_conflict',
      });
      await expect(token.stake({ userId: USER_B, amount: amt('1000'), tier: 'flex', stakeId })).rejects.toMatchObject({
        code: 'token.stake_conflict',
      });
      expect(await stakedOf(USER_A)).toBe('1000');
      expect(await stakedOf(USER_B)).toBe('0');
    });

    it('never records a stake the ledger did not fund', async () => {
      await fund(USER_A, '50');
      await expect(token.stake({ userId: USER_A, amount: amt('999'), tier: 'm3' })).rejects.toThrow();

      const staked = await token.stakeOf(USER_A);
      expect(formatAmount(staked)).toBe('0');
      expect(await stakedOf(USER_A)).toBe('0');
    });

    it('emits stakeCreated', async () => {
      await fund(USER_A, '1000');
      const stake = await token.stake({ userId: USER_A, amount: amt('1000'), tier: 'm3' });
      const emitted = bus.emitted('stakeCreated');
      expect(emitted).toHaveLength(1);
      expect(emitted[0]?.payload).toMatchObject({ stakeId: stake.id, amount: '1000', tier: 'm3' });
    });

    it('sums active stakes and ignores closed ones', async () => {
      await fund(USER_A, '10000');
      await token.stake({ userId: USER_A, amount: amt('1000'), tier: 'flex' });
      const second = await token.stake({ userId: USER_A, amount: amt('2500'), tier: 'flex' });

      expect(formatAmount(await token.stakeOf(USER_A))).toBe('3500');

      await token.unstake(second.id);
      expect(formatAmount(await token.stakeOf(USER_A))).toBe('1000');
    });

    it("listStakes returns only the caller's active stakes by default", async () => {
      await fund(USER_A, '5000');
      await fund(USER_B, '5000');
      const a1 = await token.stake({ userId: USER_A, amount: amt('1000'), tier: 'flex' });
      const a2 = await token.stake({ userId: USER_A, amount: amt('2000'), tier: 'm3' });
      await token.stake({ userId: USER_B, amount: amt('5000'), tier: 'flex' });
      await token.unstake(a1.id);

      const active = await token.listStakes(USER_A);
      expect(active).toHaveLength(1);
      expect(active[0]?.id).toBe(a2.id);
      expect(formatAmount(active[0]!.amount)).toBe('2000');

      const all = await token.listStakes(USER_A, 'all');
      expect(all.map((s) => s.id).sort()).toEqual([a1.id, a2.id].sort());

      const closed = await token.listStakes(USER_A, 'closed');
      expect(closed).toHaveLength(1);
      expect(closed[0]?.id).toBe(a1.id);
    });

    it('getStake returns null for unknown ids and returns active stakes', async () => {
      expect(await token.getStake('44444444-4444-4444-8444-444444444444')).toBeNull();

      await fund(USER_A, '1000');
      const stake = await token.stake({ userId: USER_A, amount: amt('1000'), tier: 'flex' });
      const got = await token.getStake(stake.id);
      expect(got?.userId).toBe(USER_A);
      expect(formatAmount(got!.amount)).toBe('1000');
    });
  });

  describe('unstaking and lock enforcement', () => {
    it('returns the principal for an unlocked flex stake', async () => {
      await fund(USER_A, '1000');
      const stake = await token.stake({ userId: USER_A, amount: amt('1000'), tier: 'flex' });

      await token.unstake(stake.id);

      expect(await balanceOf(USER_A)).toBe('1000');
      expect(await stakedOf(USER_A)).toBe('0');
    });

    it('refuses to unstake a locked stake, and moves no value', async () => {
      await fund(USER_A, '1000');
      const stake = await token.stake({ userId: USER_A, amount: amt('1000'), tier: 'm12' });

      await expect(token.unstake(stake.id)).rejects.toMatchObject({ code: 'token.stake_locked' });

      expect(await balanceOf(USER_A)).toBe('0');
      expect(await stakedOf(USER_A)).toBe('1000');
    });

    it('allows the unstake once the lock has elapsed', async () => {
      await fund(USER_A, '1000');
      const stake = await token.stake({ userId: USER_A, amount: amt('1000'), tier: 'm3' });

      const afterLock = new Date(Date.now() + 400 * 24 * 60 * 60 * 1000);
      await token.unstake(stake.id, afterLock);

      expect(await balanceOf(USER_A)).toBe('1000');
    });

    it('refuses to unstake twice — the principal is returned exactly once', async () => {
      await fund(USER_A, '1000');
      const stake = await token.stake({ userId: USER_A, amount: amt('1000'), tier: 'flex' });

      await token.unstake(stake.id);
      await expect(token.unstake(stake.id)).rejects.toMatchObject({ code: 'token.stake_closed' });

      expect(await balanceOf(USER_A)).toBe('1000');
    });

    it('survives concurrent unstake attempts without double-paying', async () => {
      await fund(USER_A, '1000');
      const stake = await token.stake({ userId: USER_A, amount: amt('1000'), tier: 'flex' });

      const results = await Promise.all(
        Array.from({ length: 8 }, () =>
          token
            .unstake(stake.id)
            .then(() => 'ok' as const)
            .catch(() => 'rejected' as const),
        ),
      );

      expect(results.filter((r) => r === 'ok')).toHaveLength(1);
      expect(await balanceOf(USER_A)).toBe('1000');
    });

    it('rejects an unknown stake', async () => {
      await expect(token.unstake('44444444-4444-4444-8444-444444444444')).rejects.toMatchObject({
        code: 'token.stake_not_found',
      });
    });

    it('refuses to unstake a pending (unfunded) claim and moves no value', async () => {
      // The throw exists for status=pending; only the time-lock branch was
      // executed. A pending row is a claim without ledger principal behind it —
      // unstaking it must not invent a return of funds.
      const stakeId = '55555555-5555-4555-8555-555555555555';
      await sql`
        INSERT INTO token.stakes (id, user_id, amount, tier, multiplier_bps, started_at, unlocks_at, status)
        VALUES (
          ${stakeId}, ${USER_A}, ${'1000'}::numeric, 'flex', 10000,
          now(), null, 'pending'
        )
      `;

      await expect(token.unstake(stakeId)).rejects.toMatchObject({ code: 'token.stake_locked' });

      const rows = await sql<Array<{ status: string }>>`SELECT status FROM token.stakes WHERE id = ${stakeId}`;
      expect(rows[0]?.status).toBe('pending');
      expect(await balanceOf(USER_A)).toBe('0');
      expect(await stakedOf(USER_A)).toBe('0');
    });
  });

  // ── Fee discount (§4.3) ───────────────────────────────────────────────────

  describe('fee discount — token_params is the authority', () => {
    /** The seeded row, restored after any test that edits it. */
    const readSchedule = async () =>
      (await sql<Array<{ fee_discount_schedule: unknown }>>`SELECT fee_discount_schedule FROM token.token_params WHERE id = true`)[0]!
        .fee_discount_schedule;

    it('answers from the seeded row', async () => {
      await fund(USER_A, '10000');
      await token.stake({ userId: USER_A, amount: amt('10000'), tier: 'flex' });

      // 2000 is what `token_params` holds at the 10,000 IFC step. Written out, not read back
      // out of the schedule — the old tests derived their expectation from the very array
      // they were checking, which is why a four-step divergence survived.
      expect((await token.accessOf(USER_A)).feeDiscountBps).toBe(2_000);
    });

    it('follows a governance edit to the row without a redeploy (§4.3 fee_param)', async () => {
      const original = await readSchedule();
      try {
        await sql`
          UPDATE token.token_params
             SET fee_discount_schedule = ${sql.json({
               basis: 'staked',
               tiers: [
                 { minStake: '0', discountBps: 0 },
                 { minStake: '10000', discountBps: 4_200 },
               ],
             } as never)}
           WHERE id = true
        `;

        await fund(USER_A, '10000');
        await token.stake({ userId: USER_A, amount: amt('10000'), tier: 'flex' });

        // ttl 0 so the read is not answered from a cache filled before the edit.
        const fresh = new TokenService(sql, ledger, bus, { ...options, feeScheduleTtlMs: 0 });
        expect((await fresh.accessOf(USER_A)).feeDiscountBps).toBe(4_200);
      } finally {
        await sql`UPDATE token.token_params SET fee_discount_schedule = ${sql.json(original as never)} WHERE id = true`;
      }
    });

    it('refuses to serve a discount at all when the row is unreadable', async () => {
      // No fallback to the compiled-in default, deliberately: falling back would charge a
      // discount the database does not hold, silently — the exact failure being fixed here.
      const original = await readSchedule();
      try {
        await sql`UPDATE token.token_params SET fee_discount_schedule = '{"basis":"balance","tiers":[]}'::jsonb WHERE id = true`;
        const fresh = new TokenService(sql, ledger, bus, { ...options, feeScheduleTtlMs: 0 });
        await expect(fresh.accessOf(USER_A)).rejects.toThrow(RangeError);
      } finally {
        await sql`UPDATE token.token_params SET fee_discount_schedule = ${sql.json(original as never)} WHERE id = true`;
      }
    });
  });

  // ── Real yield ────────────────────────────────────────────────────────────

  describe('real-yield distribution', () => {
    it('pays revenue to stakers and the books still close', async () => {
      await fund(USER_A, '1000');
      await fund(USER_B, '1000');
      await token.stake({ userId: USER_A, amount: amt('1000'), tier: 'flex' });
      await token.stake({ userId: USER_B, amount: amt('1000'), tier: 'flex' });

      await accrueFees('trade', '100');

      const result = await token.distributeRevenue({ windowId: 'w1', sources: [{ module: 'trade', amount: amt('100') }] });

      expect(result.recipients).toBe(2);
      expect(formatAmount(result.distributed)).toBe('100');
      // Equal stakes, equal tier — equal split.
      expect(await balanceOf(USER_A)).toBe('50');
      expect(await balanceOf(USER_B)).toBe('50');

      expect(ledger.totalsByAsset().IFC).toBe('0');
      expect(ledger.reconcile()).toEqual({ ok: true });
    });

    it('weights by tier multiplier, not just by amount', async () => {
      await fund(USER_A, '1000');
      await fund(USER_B, '1000');
      await token.stake({ userId: USER_A, amount: amt('1000'), tier: 'flex' });
      await token.stake({ userId: USER_B, amount: amt('1000'), tier: 'm12' });

      await accrueFees('trade', '100');
      await token.distributeRevenue({ windowId: 'w-tier', sources: [{ module: 'trade', amount: amt('100') }] });

      // Same principal, longer lock — B must receive strictly more.
      const a = parseFloat(await balanceOf(USER_A));
      const b = parseFloat(await balanceOf(USER_B));
      expect(b).toBeGreaterThan(a);
      expect(a + b).toBeCloseTo(100, 10);
    });

    it('pays a user holding TWO stakes the sum of both shares', async () => {
      // The bug this covers: `distributeYield` returns one share PER STAKE, but
      // the reward key is per (window, user). Posting each share separately made
      // the second a silent idempotency no-op — the user was underpaid and the
      // remainder sat in the rewards engine. Found by partner audit; there was
      // no test, which is exactly why it survived.
      await fund(USER_A, '2000');
      await token.stake({ userId: USER_A, amount: amt('1000'), tier: 'flex' });
      await token.stake({ userId: USER_A, amount: amt('1000'), tier: 'm12' });

      await accrueFees('trade', '100');
      const result = await token.distributeRevenue({ windowId: 'w-multi', sources: [{ module: 'trade', amount: amt('100') }] });

      // One recipient, one payout — and the WHOLE window distributed.
      expect(result.recipients).toBe(1);
      expect(formatAmount(result.distributed)).toBe('100');
      expect(await balanceOf(USER_A)).toBe('100');

      // Nothing stranded in the rewards engine.
      expect(formatAmount((await ledger.balance(rewardsEngine('IFC'))).amount)).toBe('0');
      expect(ledger.totalsByAsset().IFC).toBe('0');
      expect(ledger.reconcile()).toEqual({ ok: true });
    });

    it('weights by the multiplier stored on the stake, not by today’s ladder', async () => {
      // `multiplier_bps` was written at stake time and then never read — yield
      // used the live STAKE_TIERS table instead. A staker who locked for twelve
      // months bought THAT multiplier; re-tuning the ladder afterwards must not
      // retroactively change what they earn.
      await fund(USER_A, '1000');
      await fund(USER_B, '1000');
      const a = await token.stake({ userId: USER_A, amount: amt('1000'), tier: 'flex' });
      await token.stake({ userId: USER_B, amount: amt('1000'), tier: 'flex' });

      // A stake opened under a more generous historical ladder.
      await sql`UPDATE token.stakes SET multiplier_bps = 30000 WHERE id = ${a.id}`;

      await accrueFees('trade', '100');
      await token.distributeRevenue({ windowId: 'w-snapshot', sources: [{ module: 'trade', amount: amt('100') }] });

      // 3× weight against 1× → 75/25, not the 50/50 the live ladder would give.
      expect(await balanceOf(USER_A)).toBe('75');
      expect(await balanceOf(USER_B)).toBe('25');
      expect(ledger.totalsByAsset().IFC).toBe('0');
    });

    it('distributes the exact total with no dust lost across uneven stakes', async () => {
      const users = [USER_A, USER_B, USER_C];
      const amounts = ['333.333333333333333333', '1000', '7'];

      for (const [i, user] of users.entries()) {
        await fund(user, amounts[i]!);
        await token.stake({ userId: user, amount: amt(amounts[i]!), tier: 'flex' });
      }

      const revenue = '100.000000000000000001';
      await accrueFees('trade', revenue);
      const result = await token.distributeRevenue({ windowId: 'w-dust', sources: [{ module: 'trade', amount: amt(revenue) }] });

      expect(formatAmount(result.distributed)).toBe(revenue);
      expect(ledger.totalsByAsset().IFC).toBe('0');
    });

    it('is resumable — re-running a window pays nobody twice', async () => {
      await fund(USER_A, '1000');
      await token.stake({ userId: USER_A, amount: amt('1000'), tier: 'flex' });
      await accrueFees('trade', '100');

      await token.distributeRevenue({ windowId: 'w-retry', sources: [{ module: 'trade', amount: amt('100') }] });
      const again = await token.distributeRevenue({ windowId: 'w-retry', sources: [{ module: 'trade', amount: amt('100') }] });

      expect(await balanceOf(USER_A)).toBe('100');
      expect(ledger.reconcile()).toEqual({ ok: true });

      // And the RE-RUN SAYS SO. It used to report `distributed: 100,
      // recipients: 1` — counting a post the ledger had turned into a no-op —
      // so the operator's only feedback channel said the window had paid out
      // twice.
      expect(formatAmount(again.distributed)).toBe('0');
      expect(again.recipients).toBe(0);
      expect(again.alreadyPaid).toBe(1);
    });

    it('collapses duplicate source modules so the plan total matches what was swept', async () => {
      // Sweep key is per (window, module). Two legs of 50 used to plan 100 while
      // only the first 50 moved — plan underfunded, payouts fail mid-loop or
      // drain another window's residual in the rewards engine.
      await fund(USER_A, '1000');
      await token.stake({ userId: USER_A, amount: amt('1000'), tier: 'flex' });
      await accrueFees('trade', '100');

      const result = await token.distributeRevenue({
        windowId: 'w-dup-module',
        sources: [
          { module: 'trade', amount: amt('50') },
          { module: 'trade', amount: amt('50') },
        ],
      });

      expect(formatAmount(result.distributed)).toBe('100');
      expect(result.recipients).toBe(1);
      expect(await balanceOf(USER_A)).toBe('100');
      expect(formatAmount((await ledger.balance(rewardsEngine('IFC'))).amount)).toBe('0');
      expect(ledger.reconcile()).toEqual({ ok: true });
    });

    it('concurrent re-settles of the same unpaid plan report one payout, not two', async () => {
      await fund(USER_A, '1000');
      await token.stake({ userId: USER_A, amount: amt('1000'), tier: 'flex' });
      await accrueFees('trade', '100');

      // First call plans + pays. Second wave of concurrent retries must not
      // each report distributed=100 (money is ledger-safe; the operator channel
      // used to lie).
      await token.distributeRevenue({ windowId: 'w-conc', sources: [{ module: 'trade', amount: amt('100') }] });

      const results = await Promise.all(
        Array.from({ length: 8 }, () =>
          token.distributeRevenue({ windowId: 'w-conc', sources: [{ module: 'trade', amount: amt('100') }] }),
        ),
      );

      expect(results.every((r) => formatAmount(r.distributed) === '0')).toBe(true);
      expect(results.every((r) => r.recipients === 0)).toBe(true);
      expect(results.every((r) => r.alreadyPaid === 1)).toBe(true);
      expect(await balanceOf(USER_A)).toBe('100');
      expect(ledger.reconcile()).toEqual({ ok: true });
    });

    /**
     * ═════════════════════════════════════════════════════════════════════════
     * A WINDOW PAYS THE STAKERS IT HAD, NOT THE STAKERS IT HAS
     * ═════════════════════════════════════════════════════════════════════════
     *
     * `distributeRevenue` documents itself as resumable — "re-running pays only
     * whoever was missed". That was true only while the staker set stood still,
     * and the staker set moves continuously.
     *
     * The recipient list was recomputed from `status = 'active'` on every call.
     * Re-run a fully-settled window after ONE new stake opened and the list
     * grew: the users already paid had spent their `(window, user)` reward keys
     * so their posts became silent no-ops, and the newcomer's key was fresh —
     * so the newcomer was paid in full out of a window whose revenue was
     * already gone. `rewardsEngine` is a `house` account and §4.2 makes every
     * non-treasury account hard non-negative, so that value comes out of some
     * OTHER window's undistributed revenue, or the run dies mid-loop and leaves
     * the window half paid.
     */
    it('does not pay a staker who joined AFTER the window was distributed', async () => {
      await fund(USER_A, '1000');
      await token.stake({ userId: USER_A, amount: amt('1000'), tier: 'flex' });
      await accrueFees('trade', '100');

      const first = await token.distributeRevenue({ windowId: 'w-late', sources: [{ module: 'trade', amount: amt('100') }] });
      expect(formatAmount(first.distributed)).toBe('100');
      expect(await balanceOf(USER_A)).toBe('100');
      // The window is settled to the attounit — nothing is left behind it.
      expect(formatAmount((await ledger.balance(rewardsEngine('IFC'))).amount)).toBe('0');

      // A newcomer stakes, and the operator re-runs the window — the operation
      // the method's own docstring calls safe.
      await fund(USER_B, '1000');
      await token.stake({ userId: USER_B, amount: amt('1000'), tier: 'flex' });

      const again = await token.distributeRevenue({ windowId: 'w-late', sources: [{ module: 'trade', amount: amt('100') }] });

      // B was not staked when this window was planned, so this window owes B
      // nothing. B earns from the NEXT window, like everybody else who joined.
      expect(await balanceOf(USER_B)).toBe('0');
      expect(formatAmount(again.distributed)).toBe('0');
      expect(again.recipients).toBe(0);
      expect(again.alreadyPaid).toBe(1);

      // And nothing was conjured: A keeps exactly the window, the engine is
      // still empty, and the books close.
      expect(await balanceOf(USER_A)).toBe('100');
      expect(formatAmount((await ledger.balance(rewardsEngine('IFC'))).amount)).toBe('0');
      expect(ledger.totalsByAsset().IFC).toBe('0');
      expect(ledger.reconcile()).toEqual({ ok: true });
    });

    it('finishes a window that crashed halfway, paying only whoever was missed', async () => {
      // The promise the frozen plan has to keep: resumability is the REASON
      // each payout is its own transaction, and it must survive the plan being
      // frozen.
      for (const user of [USER_A, USER_B]) {
        await fund(user, '1000');
        await token.stake({ userId: user, amount: amt('1000'), tier: 'flex' });
      }
      await accrueFees('trade', '100');

      // First run pays both. Then forget that B was paid, exactly as a crash
      // between the ledger post and the row update would leave it.
      await token.distributeRevenue({ windowId: 'w-crash', sources: [{ module: 'trade', amount: amt('100') }] });
      await sql`UPDATE token.yield_payouts SET ledger_tx_id = NULL, paid_at = NULL WHERE window_id = 'w-crash' AND user_id = ${USER_B}`;

      const resumed = await token.distributeRevenue({ windowId: 'w-crash', sources: [{ module: 'trade', amount: amt('100') }] });

      // B's post is re-driven and the ledger's key makes it a no-op, so nobody
      // is paid twice — and A, whose row still says paid, is not re-posted.
      expect(resumed.alreadyPaid).toBe(1);
      expect(resumed.recipients).toBe(1);
      expect(await balanceOf(USER_A)).toBe('50');
      expect(await balanceOf(USER_B)).toBe('50');
      expect(ledger.reconcile()).toEqual({ ok: true });
    });

    it('refuses a re-run that names a different revenue total for the same window', async () => {
      await fund(USER_A, '1000');
      await token.stake({ userId: USER_A, amount: amt('1000'), tier: 'flex' });
      await accrueFees('trade', '100');
      await token.distributeRevenue({ windowId: 'w-changed', sources: [{ module: 'trade', amount: amt('100') }] });

      // `sources` is operator-typed. Paying the frozen plan while the operator
      // asks for a different figure answers a request nobody made; re-planning
      // pays the difference to whoever is staked today. Saying so beats both.
      await accrueFees('trade', '900');
      await expect(
        token.distributeRevenue({ windowId: 'w-changed', sources: [{ module: 'trade', amount: amt('1000') }] }),
      ).rejects.toMatchObject({ code: 'token.yield_window_mismatch' });

      expect(await balanceOf(USER_A)).toBe('100');
    });

    it('does not pay a staker who joined AFTER an empty window was claimed', async () => {
      // W4 residual / 0004: empty distribute used to write no plan row, so a
      // later stake + re-run of the same window id planned the newcomer and
      // paid them out of revenue already swept under that id. The header freezes
      // the empty answer; late joiners use a new window id.
      await accrueFees('trade', '100');
      const empty = await token.distributeRevenue({ windowId: 'w-later', sources: [{ module: 'trade', amount: amt('100') }] });
      expect(empty.recipients).toBe(0);
      expect(formatAmount(empty.distributed)).toBe('0');

      const headers = await sql<Array<{ window_id: string; total_amount: string }>>`
        SELECT window_id, total_amount FROM token.yield_windows WHERE window_id = 'w-later'
      `;
      expect(headers).toHaveLength(1);
      expect(amt(headers[0]!.total_amount)).toBe(amt('100'));

      await fund(USER_A, '1000');
      await token.stake({ userId: USER_A, amount: amt('1000'), tier: 'flex' });

      const again = await token.distributeRevenue({ windowId: 'w-later', sources: [{ module: 'trade', amount: amt('100') }] });
      expect(formatAmount(again.distributed)).toBe('0');
      expect(again.recipients).toBe(0);
      expect(await balanceOf(USER_A)).toBe('0');
      // Revenue still in the engine for a NEW window id.
      expect(formatAmount((await ledger.balance(rewardsEngine('IFC'))).amount)).toBe('100');

      const next = await token.distributeRevenue({ windowId: 'w-later-2', sources: [{ module: 'trade', amount: amt('100') }] });
      expect(formatAmount(next.distributed)).toBe('100');
      expect(await balanceOf(USER_A)).toBe('100');
      expect(ledger.reconcile()).toEqual({ ok: true });
    });

    it('refuses a different total on a previously empty window', async () => {
      await accrueFees('trade', '100');
      await token.distributeRevenue({ windowId: 'w-empty-mismatch', sources: [{ module: 'trade', amount: amt('100') }] });

      await accrueFees('trade', '50');
      await expect(
        token.distributeRevenue({ windowId: 'w-empty-mismatch', sources: [{ module: 'trade', amount: amt('150') }] }),
      ).rejects.toMatchObject({ code: 'token.yield_window_mismatch' });

      // Header total frozen; no payouts invented.
      const headers = await sql<Array<{ total_amount: string }>>`
        SELECT total_amount FROM token.yield_windows WHERE window_id = 'w-empty-mismatch'
      `;
      expect(amt(headers[0]!.total_amount)).toBe(amt('100'));
      expect(await sql`SELECT user_id FROM token.yield_payouts WHERE window_id = 'w-empty-mismatch'`).toHaveLength(0);
    });

    it('leaves fees in houseFees when nobody is staked (does not sweep into the engine)', async () => {
      await accrueFees('trade', '100');
      const result = await token.distributeRevenue({ windowId: 'w-empty', sources: [{ module: 'trade', amount: amt('100') }] });

      expect(result.recipients).toBe(0);
      // Empty claim freezes the window id but does not move fees — a later
      // window id with stakers can still sweep the pot.
      expect(formatAmount((await ledger.balance(houseFees('trade', 'IFC'))).amount)).toBe('100');
      expect(formatAmount((await ledger.balance(rewardsEngine('IFC'))).amount)).toBe('0');
      expect(ledger.totalsByAsset().IFC).toBe('0');
      expect(await sql`SELECT window_id FROM token.yield_windows WHERE window_id = 'w-empty'`).toHaveLength(1);
    });

    it('refuses a window with no revenue rather than posting nothing quietly', async () => {
      await expect(token.distributeRevenue({ windowId: 'w-zero', sources: [] })).rejects.toMatchObject({
        code: 'token.nothing_to_distribute',
      });
    });

    it('refuses a fee source larger than the houseFees pot before claiming the window', async () => {
      // T-03 residual: operator-typed sources used to skip the balance check.
      // Over-claim then either underfunded the plan or died mid-sweep after the
      // header was already claimed. Fail closed on the pot that actually holds
      // the fees — under-claim (leaving fees behind) is still allowed.
      await fund(USER_A, '1000');
      await token.stake({ userId: USER_A, amount: amt('1000'), tier: 'flex' });
      await accrueFees('trade', '50');

      await expect(
        token.distributeRevenue({ windowId: 'w-overclaim', sources: [{ module: 'trade', amount: amt('100') }] }),
      ).rejects.toMatchObject({ code: 'token.yield_source_underfunded' });

      // No header claimed, no fees moved.
      expect(await sql`SELECT window_id FROM token.yield_windows WHERE window_id = 'w-overclaim'`).toHaveLength(0);
      expect(formatAmount((await ledger.balance(houseFees('trade', 'IFC'))).amount)).toBe('50');
      expect(await balanceOf(USER_A)).toBe('0');
    });

    it('drains the source module fee account', async () => {
      await fund(USER_A, '1000');
      await token.stake({ userId: USER_A, amount: amt('1000'), tier: 'flex' });
      await accrueFees('trade', '100');

      expect(formatAmount((await ledger.balance(houseFees('trade', 'IFC'))).amount)).toBe('100');
      await token.distributeRevenue({ windowId: 'w-drain', sources: [{ module: 'trade', amount: amt('100') }] });
      expect(formatAmount((await ledger.balance(houseFees('trade', 'IFC'))).amount)).toBe('0');
    });
  });

  // ── Buyback & burn ────────────────────────────────────────────────────────

  describe('buyback and burn', () => {
    it('burns its share and leaves the remainder in the rewards engine', async () => {
      await accrueFees('trade', '1000');
      await token.distributeRevenue({ windowId: 'w-bb', sources: [{ module: 'trade', amount: amt('1000') }] });

      const result = await token.recordBuyback({
        runId: crypto.randomUUID(),
        revenueWindow: { from: new Date('2026-07-01'), to: new Date('2026-07-07') },
        revenueTotal: { IFC: '1000' },
        tokensBought: amt('1000'),
      });

      expect(result.burned + result.toRewards).toBe(amt('1000'));
      expect(formatAmount(await token.burnedSupply())).toBe(formatAmount(result.burned));
      expect(ledger.totalsByAsset().IFC).toBe('0');
    });

    it('records the run and is idempotent on the run id', async () => {
      await accrueFees('trade', '1000');
      await token.distributeRevenue({ windowId: 'w-bb2', sources: [{ module: 'trade', amount: amt('1000') }] });

      const runId = crypto.randomUUID();
      const input = {
        runId,
        revenueWindow: { from: new Date('2026-08-01'), to: new Date('2026-08-07') },
        revenueTotal: { IFC: '1000' },
        tokensBought: amt('500'),
      };

      const first = await token.recordBuyback(input);
      const burnedAfterFirst = await token.burnedSupply();
      const second = await token.recordBuyback(input);

      const rows = await sql`SELECT id FROM token.buyback_runs WHERE id = ${runId}`;
      expect(rows).toHaveLength(1);
      // The burn posted exactly once, so the burn balance did not double.
      expect(formatAmount(await token.burnedSupply())).toBe(formatAmount(burnedAfterFirst));
      expect(formatAmount(burnedAfterFirst)).not.toBe('0');
      // A retry reports what the run actually burned, read back from the row.
      expect(second).toEqual(first);
      expect(ledger.reconcile()).toEqual({ ok: true });
    });

    it('emits buybackExecuted with a split that sums to what was bought', async () => {
      await accrueFees('trade', '777');
      await token.distributeRevenue({ windowId: 'w-bb3', sources: [{ module: 'trade', amount: amt('777') }] });

      await token.recordBuyback({
        runId: crypto.randomUUID(),
        revenueWindow: { from: new Date('2026-09-01'), to: new Date('2026-09-07') },
        revenueTotal: { IFC: '777' },
        tokensBought: amt('777'),
      });

      const emitted = bus.emitted('buybackExecuted')[0]!;
      const burned = amt(emitted.payload.tokensBurned);
      const toRewards = amt(emitted.payload.tokensToRewards);
      expect(burned + toRewards).toBe(amt('777'));
    });

    it('refuses tokensBought=0 before claiming the window — zero must not spend the interval', async () => {
      const window = { from: new Date('2026-10-01T00:00:00Z'), to: new Date('2026-10-08T00:00:00Z') };

      await expect(
        token.recordBuyback({
          runId: crypto.randomUUID(),
          revenueWindow: window,
          revenueTotal: { IFC: '0' },
          tokensBought: amt('0'),
        }),
      ).rejects.toMatchObject({ code: 'token.buyback_revenue_invalid' });

      // No claim row — a later real burn for the same window must still be free.
      const rows = await sql`SELECT id FROM token.buyback_runs`;
      expect(rows).toHaveLength(0);
      expect(await token.burnedSupply()).toBe(0n);

      await accrueFees('trade', '500');
      await token.distributeRevenue({ windowId: 'w-bb-zero-then-real', sources: [{ module: 'trade', amount: amt('500') }] });
      const real = await token.recordBuyback({
        runId: crypto.randomUUID(),
        revenueWindow: window,
        revenueTotal: { IFC: '500' },
        tokensBought: amt('500'),
      });
      expect(real.burned + real.toRewards).toBe(amt('500'));
      expect(await token.burnedSupply()).toBe(real.burned);
    });
  });

  // ── Buyback: the window is claimed BEFORE the burn ─────────────────────────
  //
  // The burn is irreversible. Before 0002, `recordBuyback` posted it and only
  // then inserted the run row `ON CONFLICT (id) DO NOTHING`, while the guard was
  // a unique index on the WINDOW. A new run id over a spent window therefore
  // burned for real and then failed on an index its conflict clause did not
  // name — no row, no event, and an opaque 500.
  //
  // Every test in this block reads the BURN ACCOUNT. Asserting that an error was
  // thrown proves nothing here: the old code threw too, after the money moved.

  describe('buyback window claim (irreversible-leg ordering)', () => {
    /** Fund the rewards engine so a burn has something behind it. */
    async function fundRewards(amount: string, windowId: string) {
      await accrueFees('trade', amount);
      await token.distributeRevenue({ windowId, sources: [{ module: 'trade', amount: amt(amount) }] });
    }

    const JULY = { from: new Date('2026-07-01T00:00:00Z'), to: new Date('2026-08-01T00:00:00Z') };

    it('refuses a NEW run id over an identical window and burns nothing the second time', async () => {
      await fundRewards('4000', 'w-claim-identical');

      const first = await token.recordBuyback({
        runId: crypto.randomUUID(),
        revenueWindow: JULY,
        revenueTotal: { IFC: '1000' },
        tokensBought: amt('1000'),
      });

      const burnedAfterFirst = await token.burnedSupply();
      expect(burnedAfterFirst).toBe(first.burned);
      expect(burnedAfterFirst).toBeGreaterThan(0n);

      // A DIFFERENT run id over the SAME window. `ON CONFLICT (id)` never saw
      // this, which is precisely how the burn used to get out.
      await expect(
        token.recordBuyback({
          runId: crypto.randomUUID(),
          revenueWindow: JULY,
          revenueTotal: { IFC: '1000' },
          tokensBought: amt('1000'),
        }),
      ).rejects.toMatchObject({ name: 'TokenError', code: 'token.buyback_window_overlap' });

      // THE POINT. Read the BURN ACCOUNT, not the exception.
      //
      // Measured against the pre-fix code on this exact schema: the burn account
      // went 600 -> 1200 while `buyback_runs` kept exactly ONE row and the bus
      // saw exactly ONE event — tokens irreversibly gone, with no row, no event
      // and no named error to show for the second run. The figures are not
      // pinned here because the split rate is an undecided economic parameter;
      // the DOUBLING is the invariant, and it is what these two assertions say.
      expect(await token.burnedSupply()).toBe(burnedAfterFirst);
      expect(await token.burnedSupply()).not.toBe(burnedAfterFirst * 2n);

      // The refusal is complete: no orphan row, and no event claiming a burn.
      expect(await sql`SELECT id FROM token.buyback_runs`).toHaveLength(1);
      expect(bus.emitted('buybackExecuted')).toHaveLength(1);
      expect(ledger.reconcile()).toEqual({ ok: true });
    });

    // The failure the ADR describes verbatim: "neither a TokenError nor a
    // LedgerError, so it falls through to an opaque INTERNAL_SERVER_ERROR".
    // The raw PostgresError that used to escape here carried code '23505'.
    it('refuses by NAME, never as a raw Postgres error', async () => {
      await fundRewards('4000', 'w-claim-named');

      await token.recordBuyback({
        runId: crypto.randomUUID(),
        revenueWindow: JULY,
        revenueTotal: { IFC: '1000' },
        tokensBought: amt('1000'),
      });

      const err = await token
        .recordBuyback({
          runId: crypto.randomUUID(),
          revenueWindow: JULY,
          revenueTotal: { IFC: '1000' },
          tokensBought: amt('1000'),
        })
        .then(
          () => null,
          (e: unknown) => e,
        );

      expect(err).toBeInstanceOf(TokenError);
      expect((err as TokenError).code).toBe('token.buyback_window_overlap');
      // Not a bare PG SQLSTATE leaking through as a 500.
      expect((err as { code: string }).code).not.toBe('23505');
      expect((err as { code: string }).code).not.toBe('23P01');
      // And it names the run that actually holds the window, so an operator can act.
      const [held] = await sql<Array<{ id: string }>>`SELECT id FROM token.buyback_runs`;
      expect((err as Error).message).toContain(held!.id);
    });

    // The unique index matched only exact equality of BOTH timestamps, so every
    // one of these burned the same revenue a second time with no error at all.
    it.each([
      ['nested inside', { from: new Date('2026-07-10T00:00:00Z'), to: new Date('2026-07-20T00:00:00Z') }],
      ['strictly containing', { from: new Date('2026-06-01T00:00:00Z'), to: new Date('2026-09-01T00:00:00Z') }],
      ['overlapping the tail by a day', { from: new Date('2026-07-31T00:00:00Z'), to: new Date('2026-08-15T00:00:00Z') }],
      ['overlapping the head by a day', { from: new Date('2026-06-20T00:00:00Z'), to: new Date('2026-07-02T00:00:00Z') }],
      ['one second short of the end', { from: new Date('2026-07-01T00:00:00Z'), to: new Date('2026-07-31T23:59:59Z') }],
      ['one second past the start', { from: new Date('2026-07-01T00:00:01Z'), to: new Date('2026-08-01T00:00:00Z') }],
    ])('refuses a window %s an already-claimed one, and burns nothing', async (_label, overlapping) => {
      await fundRewards('4000', `w-claim-${_label.replace(/\s+/g, '-')}`);

      await token.recordBuyback({
        runId: crypto.randomUUID(),
        revenueWindow: JULY,
        revenueTotal: { IFC: '1000' },
        tokensBought: amt('1000'),
      });
      const burnedAfterFirst = await token.burnedSupply();

      await expect(
        token.recordBuyback({
          runId: crypto.randomUUID(),
          revenueWindow: overlapping,
          revenueTotal: { IFC: '1000' },
          tokensBought: amt('1000'),
        }),
      ).rejects.toMatchObject({ name: 'TokenError', code: 'token.buyback_window_overlap' });

      expect(formatAmount(await token.burnedSupply())).toBe(formatAmount(burnedAfterFirst));
      expect(await sql`SELECT id FROM token.buyback_runs`).toHaveLength(1);
      expect(ledger.reconcile()).toEqual({ ok: true });
    });

    // Half-open `[from, to)` is what makes a contiguous series settleable at
    // all: `to` belongs to the next window. Under closed `[from, to]` these two
    // would collide on the shared instant and a gapless series would be
    // impossible. This fixes the BOUNDARY rule only — window length, cadence and
    // whether the series must be gapless remain the owner's.
    it('allows contiguous half-open windows — [a, b) then [b, c)', async () => {
      await fundRewards('4000', 'w-claim-contiguous');

      const july = await token.recordBuyback({
        runId: crypto.randomUUID(),
        revenueWindow: { from: new Date('2026-07-01T00:00:00Z'), to: new Date('2026-08-01T00:00:00Z') },
        revenueTotal: { IFC: '1000' },
        tokensBought: amt('1000'),
      });

      // Starts at exactly the instant July ended. Not an overlap.
      const august = await token.recordBuyback({
        runId: crypto.randomUUID(),
        revenueWindow: { from: new Date('2026-08-01T00:00:00Z'), to: new Date('2026-09-01T00:00:00Z') },
        revenueTotal: { IFC: '1000' },
        tokensBought: amt('1000'),
      });

      expect(await sql`SELECT id FROM token.buyback_runs`).toHaveLength(2);
      expect(await token.burnedSupply()).toBe(july.burned + august.burned);
      expect(ledger.reconcile()).toEqual({ ok: true });
    });

    it('leaves no claim behind when the ledger refuses the burn, so the window stays available', async () => {
      // Rewards engine is empty — the burn cannot fund, and a house account may
      // not go negative.
      const runId = crypto.randomUUID();
      await expect(
        token.recordBuyback({
          runId,
          revenueWindow: JULY,
          revenueTotal: { IFC: '1000' },
          tokensBought: amt('1000'),
        }),
      ).rejects.toThrow();

      // The claim was released: a run that burned nothing must not hold a
      // window hostage forever.
      expect(await sql`SELECT id FROM token.buyback_runs`).toHaveLength(0);
      expect(formatAmount(await token.burnedSupply())).toBe('0');

      // And the window is genuinely free again.
      await fundRewards('2000', 'w-claim-released');
      const retry = await token.recordBuyback({
        runId: crypto.randomUUID(),
        revenueWindow: JULY,
        revenueTotal: { IFC: '1000' },
        tokensBought: amt('1000'),
      });
      expect(retry.burned).toBeGreaterThan(0n);
      expect(ledger.reconcile()).toEqual({ ok: true });
    });

    it('recovers a claim that crashed between claim and burn', async () => {
      await fundRewards('2000', 'w-claim-crash');

      // Exactly the state a crash after CLAIM but before POST leaves behind.
      const runId = crypto.randomUUID();
      await sql`
        INSERT INTO token.buyback_runs (
          id, revenue_window_from, revenue_window_to, revenue_total,
          tokens_bought, tokens_burned, tokens_to_rewards, status
        ) VALUES (
          ${runId}, ${JULY.from}, ${JULY.to}, ${sql.json({ IFC: '1000' } as never)},
          1000::numeric, 600::numeric, 400::numeric, 'pending'
        )
      `;
      expect(formatAmount(await token.burnedSupply())).toBe('0');

      const result = await token.recordBuyback({
        runId,
        revenueWindow: JULY,
        revenueTotal: { IFC: '1000' },
        tokensBought: amt('1000'),
      });

      // The retry posted the burn that never landed, and settled the row.
      expect(await token.burnedSupply()).toBe(result.burned);
      expect(result.burned).toBeGreaterThan(0n);
      const rows = await sql<Array<{ status: string }>>`SELECT status FROM token.buyback_runs WHERE id = ${runId}`;
      expect(rows[0]?.status).toBe('settled');
      expect(ledger.reconcile()).toEqual({ ok: true });
    });

    it('refuses to post one run id against another run id’s window, and burns nothing', async () => {
      await fundRewards('4000', 'w-claim-mismatch');

      const runId = crypto.randomUUID();
      await token.recordBuyback({ runId, revenueWindow: JULY, revenueTotal: { IFC: '1000' }, tokensBought: amt('1000') });
      const burnedAfterFirst = await token.burnedSupply();

      // Same run id, different window. Never post the caller's figures against
      // another row's identity (same class as token.stake_conflict).
      await expect(
        token.recordBuyback({
          runId,
          revenueWindow: { from: new Date('2026-11-01T00:00:00Z'), to: new Date('2026-12-01T00:00:00Z') },
          revenueTotal: { IFC: '1000' },
          tokensBought: amt('1000'),
        }),
      ).rejects.toMatchObject({ name: 'TokenError', code: 'token.buyback_run_conflict' });

      expect(formatAmount(await token.burnedSupply())).toBe(formatAmount(burnedAfterFirst));
      expect(await sql`SELECT id FROM token.buyback_runs`).toHaveLength(1);
    });

    it('refuses an empty or inverted window by name, before anything is claimed', async () => {
      await fundRewards('2000', 'w-claim-inverted');
      const instant = new Date('2026-07-01T00:00:00Z');

      for (const bad of [
        { from: instant, to: instant },
        { from: new Date('2026-08-01T00:00:00Z'), to: new Date('2026-07-01T00:00:00Z') },
      ]) {
        await expect(
          token.recordBuyback({
            runId: crypto.randomUUID(),
            revenueWindow: bad,
            revenueTotal: { IFC: '1000' },
            tokensBought: amt('1000'),
          }),
        ).rejects.toMatchObject({ name: 'TokenError', code: 'token.buyback_window_invalid' });
      }

      expect(formatAmount(await token.burnedSupply())).toBe('0');
      expect(await sql`SELECT id FROM token.buyback_runs`).toHaveLength(0);
    });
  });

  // ── Buyback: revenueTotal is the audit record, so it must parse ────────────

  describe('buyback revenueTotal validation', () => {
    const WINDOW = { from: new Date('2026-07-01T00:00:00Z'), to: new Date('2026-08-01T00:00:00Z') };

    async function attempt(revenueTotal: Record<string, string>) {
      await accrueFees('trade', '2000');
      await token.distributeRevenue({ windowId: `w-rt-${Math.random()}`, sources: [{ module: 'trade', amount: amt('2000') }] });
      return token.recordBuyback({
        runId: crypto.randomUUID(),
        revenueWindow: WINDOW,
        revenueTotal,
        tokensBought: amt('1000'),
      });
    }

    it.each([
      ['not a number at all', { IFC: 'not-a-number' }],
      ['negative revenue', { IFC: '-999' }],
      ['exponent notation', { BTC: '1e400' }],
      ['more precision than the ledger carries', { IFC: '1.0000000000000000001' }],
      ['an empty asset id', { '': '100' }],
      ['whitespace in the asset id', { 'IF C': '100' }],
      ['a number, not a decimal string (§0.6)', { IFC: 1000 as unknown as string }],
    ])('refuses %s, and burns nothing', async (_label, revenueTotal) => {
      await expect(attempt(revenueTotal)).rejects.toMatchObject({
        name: 'TokenError',
        code: 'token.buyback_revenue_invalid',
      });

      expect(formatAmount(await token.burnedSupply())).toBe('0');
      expect(await sql`SELECT id FROM token.buyback_runs`).toHaveLength(0);
    });

    it('stores one canonical spelling of each amount', async () => {
      await attempt({ IFC: '1000.000', USDT: '0.50', BTC: '0' });

      const rows = await sql<Array<{ revenue_total: Record<string, string> }>>`SELECT revenue_total FROM token.buyback_runs`;
      expect(rows[0]?.revenue_total).toEqual({ IFC: '1000', USDT: '0.5', BTC: '0' });
    });
  });

  // ── Every money method is traced (§14 DoD) ────────────────────────────────
  //
  // `recordBuyback` was the ONLY money method in this service not wrapped in
  // `withMoneySpan` — stake, unstake, distributeRevenue and mintEpoch all were.
  // An untraced burn is an irreversible movement with no span to find it by.
  //
  // The tracer in tracing.ts is resolved at import time, but @opentelemetry/api
  // hands out a proxy that resolves the global provider on each call, so a
  // provider registered here is still seen.

  describe('money-path tracing', () => {
    // Registered exactly ONCE, and never disabled. `trace.disable()` swaps the
    // global proxy provider for a fresh one, which orphans the proxy tracer
    // tracing.ts grabbed at import — after a disable, nothing records again.
    // So the buffer is cleared per test instead of the provider being reset.
    const spans: Array<{ name: string; attributes: Record<string, unknown> }> = [];

    const span = {
      setAttribute(k: string, v: unknown) {
        spans[spans.length - 1]!.attributes[k] = v;
        return span;
      },
      setAttributes() {
        return span;
      },
      setStatus() {
        return span;
      },
      recordException() {
        return span;
      },
      addEvent() {
        return span;
      },
      updateName() {
        return span;
      },
      isRecording() {
        return true;
      },
      spanContext() {
        return { traceId: '0'.repeat(32), spanId: '0'.repeat(16), traceFlags: 1 };
      },
      end() {},
    };

    const tracer = {
      startActiveSpan(name: string, ...rest: unknown[]) {
        const fn = rest.find((r) => typeof r === 'function') as (s: unknown) => unknown;
        spans.push({ name, attributes: {} });
        return fn(span);
      },
      startSpan(name: string) {
        spans.push({ name, attributes: {} });
        return span;
      },
    };

    trace.setGlobalTracerProvider({ getTracer: () => tracer } as never);

    beforeEach(() => {
      spans.length = 0;
    });

    afterAll(() => {
      trace.disable();
    });

    it('traces recordBuyback as a money path, like every other money method', async () => {
      await accrueFees('trade', '2000');
      await token.distributeRevenue({ windowId: 'w-trace', sources: [{ module: 'trade', amount: amt('2000') }] });
      await token.recordBuyback({
        runId: crypto.randomUUID(),
        revenueWindow: { from: new Date('2026-07-01T00:00:00Z'), to: new Date('2026-08-01T00:00:00Z') },
        revenueTotal: { IFC: '1000' },
        tokensBought: amt('1000'),
      });

      const buyback = spans.find((s) => s.name === 'token.recordBuyback');
      expect(buyback, `no token.recordBuyback span — saw ${spans.map((s) => s.name).join(', ')}`).toBeDefined();
      expect(buyback!.attributes['intafaced.money_path']).toBe(true);
      expect(buyback!.attributes['intafaced.operation']).toBe('buyback');
      // Amounts go on spans as decimal STRINGS, never numbers (tracing.ts).
      expect(typeof buyback!.attributes['intafaced.amount']).toBe('string');
    });

    it('keeps the refusal on the span rather than losing it', async () => {
      const window = { from: new Date('2026-07-01T00:00:00Z'), to: new Date('2026-08-01T00:00:00Z') };

      await accrueFees('trade', '4000');
      await token.distributeRevenue({ windowId: 'w-trace-2', sources: [{ module: 'trade', amount: amt('4000') }] });
      await token.recordBuyback({
        runId: crypto.randomUUID(),
        revenueWindow: window,
        revenueTotal: { IFC: '1000' },
        tokensBought: amt('1000'),
      });

      await expect(
        token.recordBuyback({
          runId: crypto.randomUUID(),
          revenueWindow: window,
          revenueTotal: { IFC: '1000' },
          tokensBought: amt('1000'),
        }),
      ).rejects.toMatchObject({ code: 'token.buyback_window_overlap' });

      // Two attempts, two spans — the refused one is not invisible.
      expect(spans.filter((s) => s.name === 'token.recordBuyback')).toHaveLength(2);
    });
  });

  // ── The economy row itself ────────────────────────────────────────────────
  //
  // `token_params` is the singleton every rate, curve and cap is read from. The
  // service refuses when it is missing rather than falling back to the constants
  // compiled into source — deliberately, because a deployment charging a
  // discount the database does not hold is the exact divergence that refusal was
  // added to close. Three throw sites, and no test named the code.

  describe('a deployment whose token_params row is missing', () => {
    let saved: Array<Record<string, unknown>>;

    beforeEach(async () => {
      saved = await sql<Array<Record<string, unknown>>>`SELECT * FROM token.token_params WHERE id = true`;
      await sql`DELETE FROM token.token_params WHERE id = true`;
    });

    afterEach(async () => {
      await sql`DELETE FROM token.token_params WHERE id = true`;
      if (saved[0]) await sql`INSERT INTO token.token_params ${sql(saved[0] as never)}`;
    });

    const dbToken = () => new TokenService(sql, ledger, bus, { ...options, loadParamsFromDb: true, feeScheduleTtlMs: 0 });

    it('refuses to price a fee discount rather than falling back to the compiled schedule', async () => {
      await expect(dbToken().feeDiscountSchedule()).rejects.toMatchObject({ code: 'token.params_missing' });
    });

    it('refuses to split a buyback rather than inventing the split', async () => {
      await expect(dbToken().buybackParams()).rejects.toMatchObject({ code: 'token.params_missing' });
    });

    it('refuses to mint rather than emitting against a curve nobody configured', async () => {
      await expect(dbToken().mintEpoch(0)).rejects.toMatchObject({ code: 'token.params_missing' });

      const rows = await sql`SELECT epoch FROM token.emission_epochs`;
      expect(rows).toHaveLength(0);
      // Nothing was minted anywhere. `totalsByAsset()` is not the check here:
      // this ledger has never seen IFC at all, so the asset has no key in it —
      // which is a stronger statement than a zero, and asserting '0' against it
      // was this test's own bug on its first CI run.
      expect(formatAmount((await ledger.balance(rewardsEngine('IFC'))).amount)).toBe('0');
    });
  });

  describe('a deployment whose token_params values are invalid', () => {
    let original: {
      buyback_bps: string;
      burn_split_bps: string;
      total_supply: string;
      halving_interval: number;
      emission_curve: unknown;
    };

    beforeEach(async () => {
      const rows = await sql<
        Array<{
          buyback_bps: string;
          burn_split_bps: string;
          total_supply: string;
          halving_interval: number;
          emission_curve: unknown;
        }>
      >`SELECT buyback_bps::text, burn_split_bps::text, total_supply::text, halving_interval, emission_curve FROM token.token_params WHERE id = true`;
      original = rows[0]!;
    });

    afterEach(async () => {
      await sql`
        UPDATE token.token_params SET
          buyback_bps = ${original.buyback_bps}::numeric,
          burn_split_bps = ${original.burn_split_bps}::numeric,
          total_supply = ${original.total_supply}::numeric,
          halving_interval = ${original.halving_interval},
          emission_curve = ${sql.json(original.emission_curve as never)}
        WHERE id = true
      `;
    });

    const dbToken = () => new TokenService(sql, ledger, bus, { ...options, loadParamsFromDb: true, feeScheduleTtlMs: 0 });

    it('refuses an emission_curve that is not an object before minting', async () => {
      // buyback_bps / halving_interval OOR are sealed by DB CHECK constraints
      // (token_params_buyback_bps_ck, token_params_halving_positive_ck) — the
      // UPDATE itself fails before the service can read. emission_curve is jsonb
      // with no shape CHECK, so the service-layer params_invalid is reachable.
      await sql`UPDATE token.token_params SET emission_curve = ${sql.json([] as never)} WHERE id = true`;
      await expect(dbToken().mintEpoch(0)).rejects.toMatchObject({ code: 'token.params_invalid' });
      const rows = await sql`SELECT epoch FROM token.emission_epochs`;
      expect(rows).toHaveLength(0);
    });

    it('refuses an emission_curve missing initialEpochReward before minting', async () => {
      await sql`UPDATE token.token_params SET emission_curve = ${sql.json({ kind: 'halving' } as never)} WHERE id = true`;
      await expect(dbToken().mintEpoch(0)).rejects.toMatchObject({ code: 'token.params_invalid' });
      const rows = await sql`SELECT epoch FROM token.emission_epochs`;
      expect(rows).toHaveLength(0);
    });
  });

  // ── Emissions ─────────────────────────────────────────────────────────────

  describe('emissions', () => {
    it('mints an epoch exactly once', async () => {
      const first = await token.mintEpoch(0);
      expect(first.minted).toBeGreaterThan(0n);

      await expect(token.mintEpoch(0)).rejects.toMatchObject({ code: 'token.epoch_closed' });

      const rows = await sql<Array<{ epoch: number; closed: boolean }>>`SELECT epoch, closed FROM token.emission_epochs`;
      expect(rows).toHaveLength(1);
      expect(rows[0]?.closed).toBe(true);
    });

    it('mints into the destination and keeps the books closed', async () => {
      const { minted } = await token.mintEpoch(0);
      expect(formatAmount((await ledger.balance(rewardsEngine('IFC'))).amount)).toBe(formatAmount(minted));
      // Minting creates supply at the treasury boundary — the book still nets to zero.
      expect(ledger.totalsByAsset().IFC).toBe('0');
    });

    it('emits less in a later halving era', async () => {
      const early = await token.mintEpoch(0);
      const later = await token.mintEpoch(DEFAULT_EMISSION_PARAMS.halvingIntervalEpochs);
      expect(later.minted).toBeLessThan(early.minted);
    });

    it('refuses to mint once the schedule is exhausted', async () => {
      // Far enough out that the reward has halved below one unit of precision.
      await expect(token.mintEpoch(10_000_000)).rejects.toMatchObject({ code: 'token.supply_exhausted' });
    });

    /**
     * ═══════════════════════════════════════════════════════════════════════
     * THE MINT CEILING WAS MEASURED AGAINST A PLAN THAT CAN BE EDITED
     * ═══════════════════════════════════════════════════════════════════════
     *
     * `token.supply_exhausted` is the only thing between a mis-tuned curve and
     * permanent supply inflation, and it had NO test naming it — the one case
     * above asserted `TokenError` and nothing more, and it only ever reached the
     * schedule-exhausted branch.
     *
     * The cap branch was worse than untested. It compares
     * `cumulativeEmission(epoch, params)` — what the CURVE says should have been
     * emitted — against `params.maxSupply`. Both live in `token_params`, which
     * §4.3 hands to governance on purpose and which the README's kill-switch
     * argument assumes can be retuned. Lower the curve after minting under a
     * generous one and the cumulative recomputes small, the cap passes, and more
     * supply is created on top of what is already out. Nothing looked at what had
     * actually been minted.
     */
    describe('against a retuned curve', () => {
      /**
       * These two rewrite the `token_params` singleton, which `beforeEach` does
       * NOT truncate — so they put it back. A suite that leaves the economy row
       * edited is a flake waiting for whoever adds the next test below it.
       */
      let original: { total_supply: string; halving_interval: number; emission_curve: unknown };

      const dbToken = () => new TokenService(sql, ledger, bus, { ...options, loadParamsFromDb: true, feeScheduleTtlMs: 0 });

      const setParams = async (totalSupply: string, initialEpochReward: string) => {
        await sql`
          UPDATE token.token_params
             SET total_supply = ${totalSupply}::numeric, halving_interval = 1000,
                 emission_curve = ${sql.json({ initialEpochReward } as never)}
           WHERE id = true
        `;
      };

      beforeEach(async () => {
        const rows = await sql<Array<typeof original>>`
          SELECT total_supply::text, halving_interval, emission_curve FROM token.token_params WHERE id = true
        `;
        original = rows[0]!;
      });

      afterEach(async () => {
        await sql`
          UPDATE token.token_params
             SET total_supply = ${original.total_supply}::numeric,
                 halving_interval = ${original.halving_interval},
                 emission_curve = ${sql.json(original.emission_curve as never)}
           WHERE id = true
        `;
      });

      it('refuses to mint past the cap after the curve underneath it is retuned down', async () => {
        // A generous curve with a small cap: one epoch takes us to the ceiling.
        await setParams('100', '100');
        const first = await dbToken().mintEpoch(0);
        expect(formatAmount(first.minted)).toBe('100');

        // Now retune the curve DOWN — an operator "fixing" a curve they think
        // was too generous. Under the new curve `cumulativeEmission` for the
        // next epoch is a single unit, which sails past a cap of 100.
        await setParams('100', '1');

        await expect(dbToken().mintEpoch(1)).rejects.toMatchObject({ code: 'token.supply_exhausted' });

        // Nothing was created, and the books still close. Refusing BEFORE the
        // post is the whole point: a mint cannot be taken back.
        const rows = await sql<Array<{ total: string }>>`SELECT COALESCE(SUM(mined_amount), 0) AS total FROM token.emission_epochs`;
        expect(formatAmount(amt(rows[0]!.total))).toBe('100');
        expect(ledger.totalsByAsset().IFC).toBe('0');
      });

      it('refuses to mint past a cap that has been lowered under an already-emitted supply', async () => {
        await setParams('1000', '100');
        await dbToken().mintEpoch(0);
        await dbToken().mintEpoch(1);

        // The cap itself is a `token_params` column. Lowering it below what is
        // already out must stop further minting, not be quietly outvoted by a
        // curve that still thinks there is room.
        await sql`UPDATE token.token_params SET total_supply = 150 WHERE id = true`;

        await expect(dbToken().mintEpoch(2)).rejects.toMatchObject({ code: 'token.supply_exhausted' });
      });
    });

    // TOKEN_ASSET_ID is configurable (env.ts) so a testnet can run its own
    // symbol, but the mint destination defaulted to a hardcoded
    // `rewardsEngine('IFC')` — so such a deployment minted its own symbol into
    // an IFC-keyed account, splitting supply across two accounts nobody
    // reconciles.
    describe('with a deployment running its own symbol', () => {
      const withSymbol = () => new TokenService(sql, ledger, bus, { ...options, assetId: 'TST' });

      it('mints into the CONFIGURED asset’s rewards engine, not IFC', async () => {
        const { minted } = await withSymbol().mintEpoch(0);

        expect(formatAmount((await ledger.balance(rewardsEngine('TST'))).amount)).toBe(formatAmount(minted));
        expect(formatAmount((await ledger.balance(rewardsEngine('IFC'))).amount)).toBe('0');
        expect(ledger.totalsByAsset().TST).toBe('0');
      });

      it('mints the next epoch into the configured asset too', async () => {
        const { minted } = await withSymbol().mintNextEpoch();

        expect(formatAmount((await ledger.balance(rewardsEngine('TST'))).amount)).toBe(formatAmount(minted));
        expect(formatAmount((await ledger.balance(rewardsEngine('IFC'))).amount)).toBe('0');
      });

      it('refuses an explicit destination keyed to another asset', async () => {
        await expect(withSymbol().mintEpoch(0, rewardsEngine('IFC'))).rejects.toMatchObject({
          name: 'TokenError',
          code: 'token.params_invalid',
        });

        expect(formatAmount((await ledger.balance(rewardsEngine('IFC'))).amount)).toBe('0');
        expect(await sql`SELECT epoch FROM token.emission_epochs`).toHaveLength(0);
      });
    });

    it('mintNextEpoch walks the sequence and nextEmissionEpoch advances', async () => {
      expect(await token.nextEmissionEpoch()).toBe(0);

      const first = await token.mintNextEpoch();
      expect(first.epoch).toBe(0);
      expect(first.minted).toBeGreaterThan(0n);
      expect(await token.nextEmissionEpoch()).toBe(1);

      const second = await token.mintNextEpoch();
      expect(second.epoch).toBe(1);
      expect(await token.nextEmissionEpoch()).toBe(2);

      // Both epochs closed exactly once; books still close.
      const rows = await sql<Array<{ epoch: number }>>`SELECT epoch FROM token.emission_epochs ORDER BY epoch`;
      expect(rows.map((r) => r.epoch)).toEqual([0, 1]);
      expect(ledger.totalsByAsset().IFC).toBe('0');
      expect(ledger.reconcile()).toEqual({ ok: true });
    });

    it('mintNextEpoch fails closed when the current epoch was already closed by mintEpoch', async () => {
      await token.mintEpoch(0);
      // next is 1 — not a re-mint of 0.
      const next = await token.mintNextEpoch();
      expect(next.epoch).toBe(1);
      await expect(token.mintEpoch(1)).rejects.toMatchObject({ code: 'token.epoch_closed' });
    });

    it('resumes an open claim with the snapshotted reward after a crash mid-flight', async () => {
      // Simulate: claim written, ledger post happened, close never ran.
      const reward = DEFAULT_EMISSION_PARAMS.initialEpochReward;
      await sql`
        INSERT INTO token.emission_epochs (epoch, scheduled_amount, mined_amount, closed)
        VALUES (0, ${formatAmount(reward)}::numeric, ${formatAmount(reward)}::numeric, false)
      `;
      await ledger.post(recipes.mintEmission({ epoch: 0, assetId: 'IFC', amount: reward, destination: rewardsEngine('IFC') }));

      // Retune would change epochReward(0) if we recomputed — prove we do not.
      const resumed = await token.mintEpoch(0);
      expect(resumed.minted).toBe(reward);

      const rows = await sql<Array<{ closed: boolean; mined_amount: string; scheduled_amount: string }>>`
        SELECT closed, mined_amount, scheduled_amount FROM token.emission_epochs WHERE epoch = 0
      `;
      expect(rows).toHaveLength(1);
      expect(rows[0]!.closed).toBe(true);
      expect(amt(rows[0]!.mined_amount)).toBe(reward);
      expect(amt(rows[0]!.scheduled_amount)).toBe(reward);
      // Ledger post was idempotent — balance is one reward, not two.
      expect(formatAmount((await ledger.balance(rewardsEngine('IFC'))).amount)).toBe(formatAmount(reward));
      expect(ledger.reconcile()).toEqual({ ok: true });
    });

    it('open claim reserves supply so a concurrent epoch cannot under-book the ceiling', async () => {
      // Claim epoch 0 open at full reward without closing — ceiling must count it.
      const reward = DEFAULT_EMISSION_PARAMS.initialEpochReward;
      await sql`
        INSERT INTO token.emission_epochs (epoch, scheduled_amount, mined_amount, closed)
        VALUES (0, ${formatAmount(reward)}::numeric, ${formatAmount(reward)}::numeric, false)
      `;

      // Cap equals one epoch reward. Epoch 1 must refuse even though 0 is not closed.
      const tight = new TokenService(sql, ledger, bus, {
        ...options,
        emission: { ...DEFAULT_EMISSION_PARAMS, maxSupply: reward },
      });
      await expect(tight.mintEpoch(1)).rejects.toMatchObject({ code: 'token.supply_exhausted' });
      expect(await sql`SELECT epoch FROM token.emission_epochs WHERE epoch = 1`).toHaveLength(0);
    });
  });

  // ── Governance (§4.3) ─────────────────────────────────────────────────────

  describe('governance — proposals and IFC-weighted voting', () => {
    const now = new Date('2026-07-15T12:00:00.000Z');
    const opensAt = new Date('2026-07-15T00:00:00.000Z');
    const closesAt = new Date('2026-07-22T00:00:00.000Z');

    it('lets a staked-tier holder open a proposal', async () => {
      await fund(USER_A, '1000');
      await token.stake({ userId: USER_A, amount: amt('1000'), tier: 'flex' });

      const proposal = await token.createProposal({
        kind: 'fee_param',
        body: { buybackBps: 1500 },
        createdBy: USER_A,
        opensAt,
        closesAt,
        now,
      });

      expect(proposal.status).toBe('open');
      expect(proposal.kind).toBe('fee_param');
      expect(proposal.body).toMatchObject({ buybackBps: 1500 });
    });

    it('refuses a zero-stake non-admin proposal', async () => {
      await expect(
        token.createProposal({
          kind: 'listing',
          body: { symbol: 'X' },
          createdBy: USER_A,
          opensAt,
          closesAt,
          now,
        }),
      ).rejects.toMatchObject({ code: 'token.proposal_not_allowed' });
    });

    it('refuses a stake just below the Initiate threshold', async () => {
      await fund(USER_A, '999');
      await token.stake({ userId: USER_A, amount: amt('999'), tier: 'flex' });
      await expect(
        token.createProposal({
          kind: 'listing',
          body: { symbol: 'X' },
          createdBy: USER_A,
          opensAt,
          closesAt,
          now,
        }),
      ).rejects.toMatchObject({ code: 'token.proposal_not_allowed' });
    });

    it('refuses a proposal window that does not close after it opens', async () => {
      await fund(USER_A, '1000');
      await token.stake({ userId: USER_A, amount: amt('1000'), tier: 'flex' });
      await expect(
        token.createProposal({
          kind: 'fee_param',
          body: {},
          createdBy: USER_A,
          opensAt: closesAt,
          closesAt: opensAt,
          now,
        }),
      ).rejects.toMatchObject({ code: 'token.proposal_window' });
    });

    it('allows a vote AT opensAt and refuses AT closesAt (half-open window)', async () => {
      await fund(USER_A, '1000');
      await token.stake({ userId: USER_A, amount: amt('1000'), tier: 'flex' });
      const proposal = await token.createProposal({
        kind: 'curriculum',
        body: {},
        createdBy: USER_A,
        opensAt,
        closesAt,
        now: opensAt,
      });

      const atOpen = await token.castVote({
        proposalId: proposal.id,
        userId: USER_A,
        choice: 'for',
        now: opensAt,
      });
      expect(formatAmount(atOpen.weight)).toBe('1000');

      await fund(USER_B, '1000');
      await token.stake({ userId: USER_B, amount: amt('1000'), tier: 'flex' });
      await expect(
        token.castVote({
          proposalId: proposal.id,
          userId: USER_B,
          choice: 'against',
          now: closesAt,
        }),
      ).rejects.toMatchObject({ code: 'token.proposal_window' });
    });

    it('survives concurrent double-votes — one ballot, one success', async () => {
      await fund(USER_A, '1000');
      await token.stake({ userId: USER_A, amount: amt('1000'), tier: 'flex' });
      const proposal = await token.createProposal({
        kind: 'listing',
        body: {},
        createdBy: USER_A,
        opensAt,
        closesAt,
        now,
      });

      const results = await Promise.all(
        Array.from({ length: 8 }, () =>
          token
            .castVote({ proposalId: proposal.id, userId: USER_A, choice: 'for', now })
            .then(() => 'ok' as const)
            .catch((err: { code?: string }) => (err?.code === 'token.already_voted' ? 'voted' : 'other')),
        ),
      );

      expect(results.filter((r) => r === 'ok')).toHaveLength(1);
      expect(results.filter((r) => r === 'voted')).toHaveLength(7);
      const detail = await token.getProposal(proposal.id);
      expect(detail.tally.voterCount).toBe(1);
    });

    it('lets admin open a proposal without stake', async () => {
      const proposal = await token.createProposal({
        kind: 'grant',
        body: { amount: '1' },
        createdBy: USER_A,
        asAdmin: true,
        opensAt,
        closesAt,
        now,
      });
      expect(proposal.status).toBe('open');
    });

    it('snapshots stakeOf as vote weight and tallies by choice', async () => {
      await fund(USER_A, '5000');
      await fund(USER_B, '2000');
      await token.stake({ userId: USER_A, amount: amt('5000'), tier: 'flex' });
      await token.stake({ userId: USER_B, amount: amt('2000'), tier: 'flex' });

      const proposal = await token.createProposal({
        kind: 'curriculum',
        body: { title: 'Core path' },
        createdBy: USER_A,
        opensAt,
        closesAt,
        now,
      });

      const aVote = await token.castVote({ proposalId: proposal.id, userId: USER_A, choice: 'for', now });
      const bVote = await token.castVote({ proposalId: proposal.id, userId: USER_B, choice: 'against', now });

      expect(formatAmount(aVote.weight)).toBe('5000');
      expect(formatAmount(bVote.weight)).toBe('2000');

      // Unstake after voting must not rewrite the snapshotted weight.
      await token.unstake((await sql<Array<{ id: string }>>`SELECT id FROM token.stakes WHERE user_id = ${USER_A} LIMIT 1`)[0]!.id);
      expect(formatAmount(await token.stakeOf(USER_A))).toBe('0');

      const detail = await token.getProposal(proposal.id);
      expect(formatAmount(detail.tally.forWeight)).toBe('5000');
      expect(formatAmount(detail.tally.againstWeight)).toBe('2000');
      expect(formatAmount(detail.tally.totalWeight)).toBe('7000');
      expect(detail.tally.voterCount).toBe(2);
    });

    // The fold ASSIGNED weight (`forWeight = w`) while `voterCount` in the same
    // loop accumulated — two idioms in one loop, indistinguishable from outside
    // only because `GROUP BY choice` happens to return each choice once. That is
    // exactly why the fold is exported: with one row per choice no black-box
    // test can tell `=` from `+=`, so the bug had nowhere to fail.
    describe('tally fold', () => {
      it('accumulates weight across repeated rows for a choice', () => {
        const tally = foldTally([
          { choice: 'for', weight: '100', n: '1' },
          { choice: 'for', weight: '250', n: '2' },
          { choice: 'against', weight: '30', n: '1' },
          { choice: 'against', weight: '70', n: '3' },
          { choice: 'abstain', weight: '5', n: '1' },
          { choice: 'abstain', weight: '15', n: '1' },
        ]);

        // Under assignment these would be the LAST row of each group —
        // 250 / 70 / 15 — and 415 of the 470 cast would vanish.
        expect(formatAmount(tally.forWeight)).toBe('350');
        expect(formatAmount(tally.againstWeight)).toBe('100');
        expect(formatAmount(tally.abstainWeight)).toBe('20');
        expect(tally.voterCount).toBe(9);
      });

      it('counts weight and voters by the same rule', () => {
        const rows = [
          { choice: 'for' as const, weight: '10', n: '1' },
          { choice: 'for' as const, weight: '10', n: '1' },
        ];
        const tally = foldTally(rows);

        // The original loop accumulated voterCount and assigned weight, so these
        // two disagreed about how many rows existed.
        expect(tally.voterCount).toBe(2);
        expect(formatAmount(tally.forWeight)).toBe('20');
      });

      it('is empty for no votes', () => {
        const tally = foldTally([]);
        expect(formatAmount(tally.forWeight)).toBe('0');
        expect(tally.voterCount).toBe(0);
      });
    });

    it('refuses a second ballot from the same user', async () => {
      await fund(USER_A, '1000');
      await token.stake({ userId: USER_A, amount: amt('1000'), tier: 'flex' });
      const proposal = await token.createProposal({
        kind: 'listing',
        createdBy: USER_A,
        opensAt,
        closesAt,
        now,
      });

      await token.castVote({ proposalId: proposal.id, userId: USER_A, choice: 'for', now });
      await expect(token.castVote({ proposalId: proposal.id, userId: USER_A, choice: 'against', now })).rejects.toMatchObject({
        code: 'token.already_voted',
      });
    });

    it('refuses a vote with zero stake', async () => {
      const proposal = await token.createProposal({
        kind: 'grant',
        createdBy: USER_A,
        asAdmin: true,
        opensAt,
        closesAt,
        now,
      });

      await expect(token.castVote({ proposalId: proposal.id, userId: USER_B, choice: 'for', now })).rejects.toMatchObject({
        code: 'token.no_voting_weight',
      });
    });

    it('refuses votes outside the window or on a non-open proposal', async () => {
      await fund(USER_A, '1000');
      await token.stake({ userId: USER_A, amount: amt('1000'), tier: 'flex' });

      const future = await token.createProposal({
        kind: 'listing',
        createdBy: USER_A,
        opensAt: new Date('2026-08-01T00:00:00.000Z'),
        closesAt: new Date('2026-08-08T00:00:00.000Z'),
        now,
      });
      expect(future.status).toBe('draft');
      await expect(token.castVote({ proposalId: future.id, userId: USER_A, choice: 'for', now })).rejects.toMatchObject({
        code: 'token.proposal_not_open',
      });

      const open = await token.createProposal({
        kind: 'listing',
        createdBy: USER_A,
        opensAt,
        closesAt,
        now,
      });
      const afterClose = new Date('2026-07-23T00:00:00.000Z');
      await expect(token.castVote({ proposalId: open.id, userId: USER_A, choice: 'for', now: afterClose })).rejects.toMatchObject({
        code: 'token.proposal_window',
      });
    });

    /**
     * A refusal nothing executes is a refusal nobody has checked still fires.
     * `token.proposal_not_found` had two throw sites and no test naming it —
     * the same shape as `token.supply_exhausted`, which turned out to be
     * guarding the wrong number (#1083).
     */
    it('refuses to vote on a proposal that does not exist, rather than recording a ballot against nothing', async () => {
      await fund(USER_A, '1000');
      await token.stake({ userId: USER_A, amount: amt('1000'), tier: 'flex' });
      const missing = '00000000-0000-4000-8000-0000000000ff';

      await expect(token.castVote({ proposalId: missing, userId: USER_A, choice: 'for', now })).rejects.toMatchObject({
        code: 'token.proposal_not_found',
      });

      const votes = await sql`SELECT id FROM token.governance_votes`;
      expect(votes).toHaveLength(0);
    });

    it('reports an unknown proposal rather than an empty tally', async () => {
      // The dangerous alternative is a zero tally, which reads as "nobody
      // voted" for a proposal that was never opened.
      await expect(token.getProposal('00000000-0000-4000-8000-0000000000fe')).rejects.toMatchObject({
        code: 'token.proposal_not_found',
      });
    });

    it('lists proposals filtered by status and kind', async () => {
      await fund(USER_A, '1000');
      await token.stake({ userId: USER_A, amount: amt('1000'), tier: 'flex' });

      await token.createProposal({ kind: 'listing', createdBy: USER_A, opensAt, closesAt, now });
      await token.createProposal({ kind: 'grant', createdBy: USER_A, opensAt, closesAt, now });
      await token.createProposal({
        kind: 'listing',
        createdBy: USER_A,
        opensAt: new Date('2026-08-01T00:00:00.000Z'),
        closesAt: new Date('2026-08-08T00:00:00.000Z'),
        now,
      });

      const open = await token.listProposals({ status: 'open' });
      expect(open).toHaveLength(2);
      const listings = await token.listProposals({ kind: 'listing' });
      expect(listings).toHaveLength(2);
      const openListings = await token.listProposals({ status: 'open', kind: 'listing' });
      expect(openListings).toHaveLength(1);
    });

    it('moves no ledger value when proposing or voting', async () => {
      await fund(USER_A, '1000');
      await token.stake({ userId: USER_A, amount: amt('1000'), tier: 'flex' });
      const availableBefore = await balanceOf(USER_A);
      const stakedBefore = await stakedOf(USER_A);

      const proposal = await token.createProposal({
        kind: 'fee_param',
        createdBy: USER_A,
        opensAt,
        closesAt,
        now,
      });
      await token.castVote({ proposalId: proposal.id, userId: USER_A, choice: 'abstain', now });

      expect(await balanceOf(USER_A)).toBe(availableBefore);
      expect(await stakedOf(USER_A)).toBe(stakedBefore);
      expect(ledger.reconcile()).toEqual({ ok: true });
    });
  });

  // ── Doctrine ──────────────────────────────────────────────────────────────

  describe('doctrine §0.6 — no balance outside the ledger', () => {
    it('every stake in the table is backed by ledger value', async () => {
      await fund(USER_A, '10000');
      await fund(USER_B, '5000');
      await token.stake({ userId: USER_A, amount: amt('4000'), tier: 'm12' });
      await token.stake({ userId: USER_A, amount: amt('1000'), tier: 'flex' });
      await token.stake({ userId: USER_B, amount: amt('5000'), tier: 'm3' });

      // The two independent answers to "how much is staked" must agree. That
      // they CAN be compared is the point of keeping value in the ledger and
      // only metadata here.
      const fromTable = formatAmount((await token.stakeOf(USER_A)) + (await token.stakeOf(USER_B)));
      const fromLedger = formatAmount(amt(await stakedOf(USER_A)) + amt(await stakedOf(USER_B)));

      expect(fromTable).toBe(fromLedger);
      expect(fromTable).toBe('10000');
    });

    it('holds no numeric balance column of its own', async () => {
      // `stakes.amount` is the principal recorded at stake time, not a running
      // balance — it never changes after insert. Anything that mutated would be
      // a second source of truth for money, which the doctrine forbids.
      await fund(USER_A, '1000');
      const stake = await token.stake({ userId: USER_A, amount: amt('1000'), tier: 'flex' });

      const before = await sql<Array<{ amount: string }>>`SELECT amount FROM token.stakes WHERE id = ${stake.id}`;
      await accrueFees('trade', '500');
      await token.distributeRevenue({ windowId: 'w-immutable', sources: [{ module: 'trade', amount: amt('500') }] });
      const after = await sql<Array<{ amount: string }>>`SELECT amount FROM token.stakes WHERE id = ${stake.id}`;

      expect(after[0]!.amount).toBe(before[0]!.amount);
      // The yield went to available, not to the stake principal.
      expect(await balanceOf(USER_A)).toBe('500');
    });
  });
}
