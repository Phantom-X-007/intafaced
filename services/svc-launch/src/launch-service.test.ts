import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { postgresRequired, resolveTestDatabaseUrl } from '@intafaced/db';
import {
  MemoryLedger,
  formatAmount,
  houseFees,
  parseAmount as amt,
  raiseContributionAccount,
  raiseSupplyAccount,
  recipes,
  userAvailable,
  vestingEscrow,
} from '@intafaced/ledger-client';
import { LaunchService } from './launch-service.js';
import { FixedStake } from './stake-source.js';
import { LaunchError } from './errors.js';

/**
 * svc-launch MONEY PATHS (§8.4, §14 "money paths ≥ 95% coverage").
 *
 * ── Why this suite builds its own database ──────────────────────────────────
 *
 * Every other service here applies its migration to the SHARED `intafaced`
 * database's `launch`/`bank`/… schema. That is a real hazard rather than a
 * stylistic quibble: two checkouts running their suites at once mutate one
 * another's schema, and a branch that changes a migration breaks `main`'s tests
 * from a completely unrelated working tree. It has already happened here.
 *
 * svc-launch's SQL is schema-qualified (`launch.raises`), so a per-suite SCHEMA
 * cannot isolate it the way `createTestDb` isolates svc-ledger. A dedicated
 * DATABASE can, and does: this suite creates one, builds `launch` inside it,
 * and drops the whole thing afterwards. Nothing outside it is ever touched.
 *
 * ── Why the ledger is in memory ─────────────────────────────────────────────
 *
 * `MemoryLedger` is the reference implementation, which the conformance suite
 * proves behaves identically to svc-ledger's Postgres engine (§4.4) — including
 * for the launch recipes, which that suite now covers. These tests are about
 * svc-launch's ordering, idempotency and arithmetic, not about the ledger.
 */

const here = dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(join(here, '..', 'drizzle', '0000_launch_init.sql'), 'utf8');

/** The superuser, because this suite creates and drops a database of its own. */
const ADMIN_URL = resolveTestDatabaseUrl('TEST_DATABASE_URL_LAUNCH_ADMIN', 'postgres://intafaced:intafaced@localhost:5433/intafaced');
const DB_NAME = `launch_test_${process.pid}_${Date.now().toString(36)}`;

const ISSUER = '11111111-1111-4111-8111-111111111111';
const USER_A = '22222222-2222-4222-8222-222222222222';
const USER_B = '33333333-3333-4333-8333-333333333333';

const DAY_MS = 24 * 60 * 60 * 1000;
const T0 = new Date('2026-07-01T00:00:00.000Z');
const at = (days: number) => new Date(T0.getTime() + days * DAY_MS);

async function provision(): Promise<{ url: string; drop: () => Promise<void> } | null> {
  const admin = postgres(ADMIN_URL, { max: 1, connect_timeout: 5, onnotice: () => undefined });
  try {
    await admin`SELECT 1`;
  } catch (err) {
    await admin.end({ timeout: 2 });
    // Residual #9: a money suite must not go silently green on CI.
    if (postgresRequired()) {
      throw new Error(`svc-launch money suite requires Postgres at ${ADMIN_URL}: ${(err as Error).message}`);
    }
    return null;
  }

  await admin.unsafe(`CREATE DATABASE "${DB_NAME}"`);
  await admin.end({ timeout: 2 });

  const url = new URL(ADMIN_URL);
  url.pathname = `/${DB_NAME}`;

  return {
    url: url.toString(),
    drop: async () => {
      const cleanup = postgres(ADMIN_URL, { max: 1, onnotice: () => undefined });
      await cleanup.unsafe(`DROP DATABASE IF EXISTS "${DB_NAME}" WITH (FORCE)`);
      await cleanup.end({ timeout: 2 });
    },
  };
}

const provisioned = await provision();

if (!provisioned) {
  describe.skip('svc-launch money paths (Postgres unavailable — start docker compose)', () => {
    it('skipped', () => undefined);
  });
} else {
  const sql = postgres(provisioned.url, {
    max: 4,
    connection: { search_path: 'launch,public', application_name: 'svc-launch-test' },
    onnotice: () => undefined,
  });

  await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS launch`);
  await sql.unsafe(migration);

  /**
   * Dropping a database is slower than vitest's 10s default hook timeout when
   * the server is busy — `pnpm verify` runs every service's suite at once. A
   * teardown that times out leaves the database behind AND fails a run whose
   * tests all passed, so the hook is given room rather than the run given a
   * false red.
   */
  afterAll(async () => {
    await sql.end({ timeout: 10 });
    await provisioned.drop();
  }, 60_000);

  let ledger: MemoryLedger;
  let launch: LaunchService;

  /** A stake high enough to clear every tier unless a test says otherwise. */
  const withStake = (staked: string) =>
    new LaunchService(sql, ledger, new FixedStake(amt(staked)), { minContribution: amt('1'), settleBatchSize: 100 });

  beforeEach(async () => {
    await sql`TRUNCATE launch.vesting_schedules, launch.allocations, launch.contributions, launch.raise_tiers, launch.raises RESTART IDENTITY CASCADE`;
    ledger = new MemoryLedger();
    launch = withStake('100000');
  });

  const fund = (userId: string, assetId: string, value: string) =>
    ledger.post(
      recipes.deposit({ userId, assetId, amount: amt(value), rail: 'test', railRef: `${userId}:${assetId}:${value}:${Math.random()}` }),
    );

  const availableOf = async (userId: string, assetId: string) =>
    formatAmount((await ledger.balance(userAvailable(userId, assetId))).amount);
  const escrowOf = async (raiseId: string, userId: string) =>
    formatAmount((await ledger.balance(raiseContributionAccount(userId, 'USDT', raiseId))).amount);
  const supplyOf = async (raiseId: string) => formatAmount((await ledger.balance(raiseSupplyAccount(ISSUER, 'IFC', raiseId))).amount);

  /** A priced presale: 1000 IFC at 1 USDT each, 2% fee. */
  const draft = (over: Partial<Parameters<LaunchService['createRaise']>[0]> = {}) =>
    launch.createRaise({
      issuerId: ISSUER,
      slug: `raise-${Math.random().toString(36).slice(2, 10)}`,
      name: 'Test Raise',
      saleAssetId: 'IFC',
      paymentAssetId: 'USDT',
      mode: 'presale',
      saleSupply: amt('1000'),
      price: amt('1'),
      softCap: amt('100'),
      hardCap: amt('1000'),
      feeBps: 200,
      opensAt: at(-1),
      closesAt: at(1),
      vestCliffDays: null,
      vestDurationDays: null,
      ...over,
    });

  interface TierSpec {
    name: string;
    minStake: string;
    allocationCap: string;
  }
  /** One gate open to everybody, unless a test is about the gate itself. */
  const OPEN_TIER: TierSpec[] = [{ name: 'Open', minStake: '0', allocationCap: '1000' }];

  const addTiers = async (raiseId: string, tiers: TierSpec[]) => {
    for (const tier of tiers) {
      await launch.addTier({
        raiseId,
        issuerId: ISSUER,
        name: tier.name,
        minStake: amt(tier.minStake),
        allocationCap: amt(tier.allocationCap),
      });
    }
  };

  /**
   * Draft → tiers → supply locked → open. The point at which a raise becomes
   * real: tiers must be settled while it is still a draft, because adding one
   * mid-raise would re-price an allocation people already committed against.
   */
  const openRaise = async (over: Parameters<typeof draft>[0] = {}, tiers: TierSpec[] = OPEN_TIER) => {
    await fund(ISSUER, 'IFC', '1000');
    const raise = await draft(over);
    await addTiers(raise.id, tiers);
    await launch.open({ raiseId: raise.id, issuerId: ISSUER });
    return raise;
  };

  describe('opening a raise', () => {
    it('locks the issuer’s supply out of their spendable balance', async () => {
      const raise = await openRaise();

      expect(await availableOf(ISSUER, 'IFC')).toBe('0');
      expect(await supplyOf(raise.id)).toBe('1000');
      expect((await launch.raise(raise.id)).status).toBe('funding');
    });

    /** An issuer cannot sell supply they do not hold — the raise never opens. */
    it('refuses to open when the issuer cannot cover the supply', async () => {
      await fund(ISSUER, 'IFC', '10');
      const raise = await draft();
      await addTiers(raise.id, OPEN_TIER);

      await expect(launch.open({ raiseId: raise.id, issuerId: ISSUER })).rejects.toThrow();
      expect((await launch.raise(raise.id)).status).toBe('draft');
      expect(await supplyOf(raise.id)).toBe('0');
    });

    it('refuses to open somebody else’s raise', async () => {
      await fund(ISSUER, 'IFC', '1000');
      const raise = await draft();
      await addTiers(raise.id, OPEN_TIER);

      await expect(launch.open({ raiseId: raise.id, issuerId: USER_A })).rejects.toThrow(LaunchError);
      expect(await supplyOf(raise.id)).toBe('0');
    });

    /**
     * A raise with no tier admits nobody, so opening one would produce a raise
     * that looks live and silently accepts no commitments.
     */
    it('refuses to open a raise with no allocation tier', async () => {
      await fund(ISSUER, 'IFC', '1000');
      const raise = await draft();

      await expect(launch.open({ raiseId: raise.id, issuerId: ISSUER })).rejects.toMatchObject({ code: 'launch.no_tiers' });
      expect(await supplyOf(raise.id)).toBe('0');
    });

    /** Locking twice would double-lock an issuer who then cannot cover a second raise. */
    it('is idempotent — re-opening locks nothing further', async () => {
      const raise = await openRaise();
      await launch.open({ raiseId: raise.id, issuerId: ISSUER }).catch(() => undefined);

      expect(await supplyOf(raise.id)).toBe('1000');
      expect(await availableOf(ISSUER, 'IFC')).toBe('0');
    });
  });

  describe('contributing', () => {
    it('escrows the commitment out of the contributor’s balance', async () => {
      const raise = await openRaise();
      await fund(USER_A, 'USDT', '500');

      await launch.contribute({ raiseId: raise.id, userId: USER_A, amount: amt('200'), now: T0 });

      expect(await availableOf(USER_A, 'USDT')).toBe('300');
      expect(await escrowOf(raise.id, USER_A)).toBe('200');
      expect(formatAmount(await launch.raised(raise.id))).toBe('200');
    });

    it('accumulates top-ups from the same contributor', async () => {
      const raise = await openRaise();
      await fund(USER_A, 'USDT', '500');

      await launch.contribute({ raiseId: raise.id, userId: USER_A, amount: amt('200'), now: T0 });
      await launch.contribute({ raiseId: raise.id, userId: USER_A, amount: amt('150'), now: T0 });

      expect(await escrowOf(raise.id, USER_A)).toBe('350');
      expect(formatAmount(await launch.escrowed(raise.id, USER_A))).toBe('350');
    });

    /** Escrow is per contributor — one person's pot is never another's. */
    it('keeps contributors’ escrow separate', async () => {
      const raise = await openRaise();
      await fund(USER_A, 'USDT', '500');
      await fund(USER_B, 'USDT', '500');

      await launch.contribute({ raiseId: raise.id, userId: USER_A, amount: amt('200'), now: T0 });
      await launch.contribute({ raiseId: raise.id, userId: USER_B, amount: amt('300'), now: T0 });

      expect(await escrowOf(raise.id, USER_A)).toBe('200');
      expect(await escrowOf(raise.id, USER_B)).toBe('300');
    });

    it('refuses a commitment the contributor cannot fund, and escrows nothing', async () => {
      const raise = await openRaise();
      await fund(USER_A, 'USDT', '10');

      await expect(launch.contribute({ raiseId: raise.id, userId: USER_A, amount: amt('200'), now: T0 })).rejects.toThrow();
      expect(await availableOf(USER_A, 'USDT')).toBe('10');
      expect(await escrowOf(raise.id, USER_A)).toBe('0');
    });

    it('refuses dust below the configured minimum', async () => {
      const raise = await openRaise();
      await fund(USER_A, 'USDT', '500');

      await expect(launch.contribute({ raiseId: raise.id, userId: USER_A, amount: amt('0.5'), now: T0 })).rejects.toMatchObject({
        code: 'launch.below_minimum',
      });
    });

    it('refuses a commitment before the window opens and after it closes', async () => {
      const raise = await openRaise();
      await fund(USER_A, 'USDT', '500');

      await expect(launch.contribute({ raiseId: raise.id, userId: USER_A, amount: amt('10'), now: at(-5) })).rejects.toMatchObject({
        code: 'launch.window_closed',
      });
      await expect(launch.contribute({ raiseId: raise.id, userId: USER_A, amount: amt('10'), now: at(5) })).rejects.toMatchObject({
        code: 'launch.window_closed',
      });
      expect(await escrowOf(raise.id, USER_A)).toBe('0');
    });

    it('refuses to take more than the hard cap', async () => {
      const raise = await openRaise({ hardCap: amt('250') });
      await fund(USER_A, 'USDT', '500');

      await launch.contribute({ raiseId: raise.id, userId: USER_A, amount: amt('250'), now: T0 });
      await expect(launch.contribute({ raiseId: raise.id, userId: USER_A, amount: amt('1'), now: T0 })).rejects.toMatchObject({
        code: 'launch.hard_cap_reached',
      });
      expect(formatAmount(await launch.raised(raise.id))).toBe('250');
    });

    /**
     * THE TIER GATE (§8.4 "allocation tiers by `token.stakeOf`").
     *
     * The stake is read live from svc-token and never cached — a cached tier
     * keeps admitting somebody after they have unstaked.
     */
    it('refuses a contributor who does not stake enough for any tier', async () => {
      const raise = await openRaise({}, [{ name: 'Gold', minStake: '1000', allocationCap: '500' }]);

      const poor = withStake('999');
      await fund(USER_A, 'USDT', '500');

      await expect(poor.contribute({ raiseId: raise.id, userId: USER_A, amount: amt('100'), now: T0 })).rejects.toMatchObject({
        code: 'launch.tier_not_met',
      });
      expect(await escrowOf(raise.id, USER_A)).toBe('0');
    });

    it('admits a contributor who meets the tier, up to its allocation cap', async () => {
      const raise = await openRaise({}, [{ name: 'Gold', minStake: '1000', allocationCap: '300' }]);

      const staker = withStake('1000');
      await fund(USER_A, 'USDT', '500');

      await staker.contribute({ raiseId: raise.id, userId: USER_A, amount: amt('300'), now: T0 });
      expect(await escrowOf(raise.id, USER_A)).toBe('300');

      await expect(staker.contribute({ raiseId: raise.id, userId: USER_A, amount: amt('1'), now: T0 })).rejects.toMatchObject({
        code: 'launch.allocation_cap_reached',
      });
    });
  });

  describe('settlement', () => {
    it('pays the issuer, takes the fee, and delivers the allocation', async () => {
      const raise = await openRaise();
      await fund(USER_A, 'USDT', '500');
      await launch.contribute({ raiseId: raise.id, userId: USER_A, amount: amt('400'), now: T0 });

      await launch.close({ raiseId: raise.id, now: at(2) });
      const result = await launch.settle({ raiseId: raise.id, now: at(2) });

      expect(result.finished).toBe(true);
      // 400 spent at 1 USDT · 2% fee = 8 to house · 392 to the issuer.
      expect(await availableOf(ISSUER, 'USDT')).toBe('392');
      expect(formatAmount((await ledger.balance(houseFees('launch', 'USDT'))).amount)).toBe('8');
      expect(await availableOf(USER_A, 'IFC')).toBe('400');
      expect(await escrowOf(raise.id, USER_A)).toBe('0');
    });

    it('returns unsold supply to the issuer and strands nothing', async () => {
      const raise = await openRaise();
      await fund(USER_A, 'USDT', '500');
      await launch.contribute({ raiseId: raise.id, userId: USER_A, amount: amt('400'), now: T0 });

      await launch.close({ raiseId: raise.id, now: at(2) });
      await launch.settle({ raiseId: raise.id, now: at(2) });

      expect(await supplyOf(raise.id)).toBe('0');
      expect(await availableOf(ISSUER, 'IFC')).toBe('600');
      expect((await launch.raise(raise.id)).status).toBe('settled');
    });

    /** A resumed settlement pays nobody twice. */
    it('is idempotent across repeated passes', async () => {
      const raise = await openRaise();
      await fund(USER_A, 'USDT', '500');
      await fund(USER_B, 'USDT', '500');
      await launch.contribute({ raiseId: raise.id, userId: USER_A, amount: amt('300'), now: T0 });
      await launch.contribute({ raiseId: raise.id, userId: USER_B, amount: amt('200'), now: T0 });

      await launch.close({ raiseId: raise.id, now: at(2) });
      await launch.settle({ raiseId: raise.id, now: at(2) });
      await launch.settle({ raiseId: raise.id, now: at(2) });

      expect(await availableOf(USER_A, 'IFC')).toBe('300');
      expect(await availableOf(USER_B, 'IFC')).toBe('200');
      expect(await availableOf(ISSUER, 'USDT')).toBe('490'); // 500 less 2%
      expect(formatAmount((await ledger.balance(houseFees('launch', 'USDT'))).amount)).toBe('10');
    });

    /**
     * A raise that misses its soft cap refunds in full and takes NO fee — the
     * platform does not charge for a raise that did not happen.
     */
    it('refunds every contributor when the soft cap is missed', async () => {
      const raise = await openRaise({ softCap: amt('1000') });
      await fund(USER_A, 'USDT', '500');
      await fund(USER_B, 'USDT', '500');
      await launch.contribute({ raiseId: raise.id, userId: USER_A, amount: amt('100'), now: T0 });
      await launch.contribute({ raiseId: raise.id, userId: USER_B, amount: amt('200'), now: T0 });

      await launch.close({ raiseId: raise.id, now: at(2) });
      await launch.settle({ raiseId: raise.id, now: at(2) });

      expect(await availableOf(USER_A, 'USDT')).toBe('500');
      expect(await availableOf(USER_B, 'USDT')).toBe('500');
      expect(await availableOf(USER_A, 'IFC')).toBe('0');
      expect(formatAmount((await ledger.balance(houseFees('launch', 'USDT'))).amount)).toBe('0');
      // The issuer's whole supply comes home.
      expect(await availableOf(ISSUER, 'IFC')).toBe('1000');
    });

    /**
     * Once contributors can commit, the window is a promise. An open raise ends
     * by CLOSING — succeeding or failing against its soft cap — never by the
     * issuer changing their mind while holding other people's money.
     */
    it('refuses to let the issuer cancel a raise that is already holding money', async () => {
      const raise = await openRaise();
      await fund(USER_A, 'USDT', '500');
      await launch.contribute({ raiseId: raise.id, userId: USER_A, amount: amt('300'), now: T0 });

      await expect(launch.cancel({ raiseId: raise.id, issuerId: ISSUER })).rejects.toMatchObject({ code: 'launch.bad_status' });
      expect(await escrowOf(raise.id, USER_A)).toBe('300');
      expect((await launch.raise(raise.id)).status).toBe('funding');
    });

    /** A draft raise has escrowed nothing, so cancelling it costs nobody anything. */
    it('lets the issuer cancel a draft raise, which holds nothing', async () => {
      await fund(ISSUER, 'IFC', '1000');
      const raise = await draft();
      await addTiers(raise.id, OPEN_TIER);

      await launch.cancel({ raiseId: raise.id, issuerId: ISSUER });

      expect((await launch.raise(raise.id)).status).toBe('cancelled');
      expect(await availableOf(ISSUER, 'IFC')).toBe('1000');
    });

    /** The books must close: nothing created, nothing destroyed, across a whole raise. */
    it('closes the books over a full raise', async () => {
      const raise = await openRaise();
      await fund(USER_A, 'USDT', '500');
      await fund(USER_B, 'USDT', '500');
      await launch.contribute({ raiseId: raise.id, userId: USER_A, amount: amt('300'), now: T0 });
      await launch.contribute({ raiseId: raise.id, userId: USER_B, amount: amt('250'), now: T0 });

      await launch.close({ raiseId: raise.id, now: at(2) });
      await launch.settle({ raiseId: raise.id, now: at(2) });

      const totals = ledger.totalsByAsset();
      expect(totals.USDT).toBe('0');
      expect(totals.IFC).toBe('0');
      expect(ledger.reconcile()).toMatchObject({ ok: true });
      expect(ledger.verifyChain()).toMatchObject({ ok: true });
    });
  });

  describe('vesting', () => {
    /** A vested allocation never lands in the beneficiary's spendable balance. */
    const vested = () => openRaise({ vestCliffDays: 30, vestDurationDays: 120 });

    it('routes the allocation into platform escrow rather than to the buyer', async () => {
      const raise = await vested();
      await fund(USER_A, 'USDT', '500');
      await launch.contribute({ raiseId: raise.id, userId: USER_A, amount: amt('400'), now: T0 });

      await launch.close({ raiseId: raise.id, now: at(2) });
      await launch.settle({ raiseId: raise.id, now: at(2) });

      expect(await availableOf(USER_A, 'IFC')).toBe('0');
      const [schedule] = await launch.schedules(USER_A);
      expect(schedule).toBeDefined();
      expect(formatAmount((await ledger.balance(vestingEscrow(schedule!.id, 'IFC'))).amount)).toBe('400');
    });

    it('releases nothing before the cliff', async () => {
      const raise = await vested();
      await fund(USER_A, 'USDT', '500');
      await launch.contribute({ raiseId: raise.id, userId: USER_A, amount: amt('400'), now: T0 });
      await launch.close({ raiseId: raise.id, now: at(2) });
      await launch.settle({ raiseId: raise.id, now: at(2) });

      const [schedule] = await launch.schedules(USER_A);
      expect(formatAmount(await launch.claimableNow(schedule!.id, at(10)))).toBe('0');
      await expect(launch.claim({ scheduleId: schedule!.id, beneficiaryId: USER_A, now: at(10) })).rejects.toMatchObject({
        code: 'launch.nothing_claimable',
      });
      expect(await availableOf(USER_A, 'IFC')).toBe('0');
    });

    it('pays a claim out of escrow and never the same tranche twice', async () => {
      const raise = await vested();
      await fund(USER_A, 'USDT', '500');
      await launch.contribute({ raiseId: raise.id, userId: USER_A, amount: amt('400'), now: T0 });
      await launch.close({ raiseId: raise.id, now: at(2) });
      await launch.settle({ raiseId: raise.id, now: at(2) });

      const [schedule] = await launch.schedules(USER_A);
      const claimAt = at(2 + 60);
      const claimable = await launch.claimableNow(schedule!.id, claimAt);
      expect(claimable > 0n).toBe(true);

      await launch.claim({ scheduleId: schedule!.id, beneficiaryId: USER_A, now: claimAt });
      expect(await availableOf(USER_A, 'IFC')).toBe(formatAmount(claimable));

      // Nothing further has vested in the same instant.
      await expect(launch.claim({ scheduleId: schedule!.id, beneficiaryId: USER_A, now: claimAt })).rejects.toMatchObject({
        code: 'launch.nothing_claimable',
      });
      expect(await availableOf(USER_A, 'IFC')).toBe(formatAmount(claimable));
    });

    it('refuses a claim by anyone but the beneficiary', async () => {
      const raise = await vested();
      await fund(USER_A, 'USDT', '500');
      await launch.contribute({ raiseId: raise.id, userId: USER_A, amount: amt('400'), now: T0 });
      await launch.close({ raiseId: raise.id, now: at(2) });
      await launch.settle({ raiseId: raise.id, now: at(2) });

      const [schedule] = await launch.schedules(USER_A);
      await expect(launch.claim({ scheduleId: schedule!.id, beneficiaryId: USER_B, now: at(200) })).rejects.toThrow(LaunchError);
      expect(await availableOf(USER_B, 'IFC')).toBe('0');
    });

    it('pays out the whole grant by the end of the schedule and no more', async () => {
      const raise = await vested();
      await fund(USER_A, 'USDT', '500');
      await launch.contribute({ raiseId: raise.id, userId: USER_A, amount: amt('400'), now: T0 });
      await launch.close({ raiseId: raise.id, now: at(2) });
      await launch.settle({ raiseId: raise.id, now: at(2) });

      const [schedule] = await launch.schedules(USER_A);
      await launch.claim({ scheduleId: schedule!.id, beneficiaryId: USER_A, now: at(1000) });

      expect(await availableOf(USER_A, 'IFC')).toBe('400');
      expect(formatAmount((await ledger.balance(vestingEscrow(schedule!.id, 'IFC'))).amount)).toBe('0');
      expect(ledger.totalsByAsset().IFC).toBe('0');
    });
  });
}
