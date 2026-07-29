import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { describe, expect, it, beforeEach, afterAll } from 'vitest';
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
  userStake,
} from '@intafaced/ledger-client';
import { TokenService, TokenError } from './token-service.js';
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

const URL = process.env.TEST_DATABASE_URL_TOKEN ?? 'postgres://svc_token:svc_token@localhost:5433/intafaced';
const here = dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(join(here, '..', 'drizzle', '0000_token_init.sql'), 'utf8');
const migrationPending = readFileSync(join(here, '..', 'drizzle', '0001_stake_pending.sql'), 'utf8');

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const USER_C = '33333333-3333-4333-8333-333333333333';

async function reachable(): Promise<boolean> {
  const probe = postgres(URL, { max: 1, connect_timeout: 3, onnotice: () => undefined });
  try {
    await probe`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await probe.end({ timeout: 2 });
  }
}

const available = await reachable();

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

  await sql.unsafe(migration);
  await sql.unsafe(migrationPending);

  let ledger: MemoryLedger;
  let bus: MemoryEventBus;
  let token: TokenService;

  const options = { assetId: 'IFC', emission: DEFAULT_EMISSION_PARAMS, buyback: DEFAULT_BUYBACK_PARAMS };

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
  const stakedOf = async (userId: string) => formatAmount((await ledger.balance(userStake(userId, 'IFC'))).amount);

  beforeEach(async () => {
    await sql`TRUNCATE token.stakes, token.buyback_runs, token.emission_epochs RESTART IDENTITY CASCADE`;
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
      await token.distributeRevenue({ windowId: 'w-retry', sources: [{ module: 'trade', amount: amt('100') }] });

      expect(await balanceOf(USER_A)).toBe('100');
      expect(ledger.reconcile()).toEqual({ ok: true });
    });

    it('leaves revenue in the rewards engine when nobody is staked', async () => {
      await accrueFees('trade', '100');
      const result = await token.distributeRevenue({ windowId: 'w-empty', sources: [{ module: 'trade', amount: amt('100') }] });

      expect(result.recipients).toBe(0);
      expect(formatAmount((await ledger.balance(rewardsEngine('IFC'))).amount)).toBe('100');
      expect(ledger.totalsByAsset().IFC).toBe('0');
    });

    it('refuses a window with no revenue rather than posting nothing quietly', async () => {
      await expect(token.distributeRevenue({ windowId: 'w-zero', sources: [] })).rejects.toMatchObject({
        code: 'token.nothing_to_distribute',
      });
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

      await token.recordBuyback(input);
      await token.recordBuyback(input);

      const rows = await sql`SELECT id FROM token.buyback_runs WHERE id = ${runId}`;
      expect(rows).toHaveLength(1);
      // The burn posted exactly once, so the burn balance did not double.
      expect(formatAmount(await token.burnedSupply())).not.toBe('0');
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
      await expect(token.mintEpoch(10_000_000)).rejects.toBeInstanceOf(TokenError);
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
      const fromLedger = formatAmount(
        (await ledger.balance(userStake(USER_A, 'IFC'))).amount + (await ledger.balance(userStake(USER_B, 'IFC'))).amount,
      );

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
