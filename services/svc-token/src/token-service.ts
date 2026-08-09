import type { Sql } from 'postgres';
import { transaction } from '@intafaced/db';
import type { EventBus } from '@intafaced/events';
import { formatAmount, parseAmount, recipes, rewardsEngine, burnAccount, type Amount, type LedgerClient } from '@intafaced/ledger-client';
import {
  ACCESS_TIERS,
  STAKE_TIERS,
  accessTierFor,
  feeDiscountBps,
  isUnlocked,
  parseFeeDiscountSchedule,
  unlockDate,
  type FeeDiscountSchedule,
  type StakeTier,
} from './economics/staking.js';
import { distributeYield, splitBuyback, type BuybackParams } from './economics/buyback.js';
import { cumulativeEmission, epochReward, type EmissionParams } from './economics/emission.js';
import { withMoneySpan } from './tracing.js';

/**
 * svc-token — THE NATIVE ECONOMY (§4.3).
 *
 * Doctrine §0.6 applies here more than anywhere: this service holds NO
 * balances. `stakes` records who staked what and when; the value itself lives
 * in the ledger's `stake` accounts. That separation is what makes "how much IFC
 * is staked" answerable two independent ways — from this table and from the
 * ledger — which is exactly the property a reconciliation job needs.
 */

export class TokenError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'token.stake_not_found'
      | 'token.stake_locked'
      | 'token.stake_closed'
      | 'token.stake_conflict'
      | 'token.epoch_closed'
      | 'token.supply_exhausted'
      | 'token.nothing_to_distribute'
      /**
       * A window id that is already planned, re-run naming a different revenue
       * total. The frozen plan and the new figure cannot both be right, and
       * guessing which one the operator meant is not this service's call.
       */
      | 'token.yield_window_mismatch'
      // Buyback refusals. Every one of these must fire BEFORE the burn posts —
      // the burn is irreversible, so a refusal that arrives after it is not a
      // refusal (0002 / token-economics ADR).
      | 'token.buyback_window_overlap'
      | 'token.buyback_window_invalid'
      | 'token.buyback_run_conflict'
      | 'token.buyback_revenue_invalid'
      | 'token.params_missing'
      | 'token.params_invalid'
      | 'token.proposal_not_found'
      | 'token.proposal_not_open'
      | 'token.proposal_window'
      | 'token.proposal_not_allowed'
      | 'token.already_voted'
      | 'token.no_voting_weight',
  ) {
    super(message);
    this.name = 'TokenError';
  }
}

/**
 * Lifecycle of a buyback run (0002).
 *
 * `pending` means the run owns its revenue window but its burn is not yet on
 * the ledger. It exists so the window can be claimed BEFORE the irreversible
 * leg posts — the same reason `token.stakes` has a `pending` status.
 */
export type BuybackRunStatus = 'pending' | 'settled';

/** §4.3 proposal surface — what an IFC-weighted vote may decide. */
export type ProposalKind = 'listing' | 'fee_param' | 'curriculum' | 'grant';
export type ProposalStatus = 'draft' | 'open' | 'passed' | 'rejected' | 'executed' | 'cancelled';
export type VoteChoice = 'for' | 'against' | 'abstain';

/**
 * Minimum access-tier stake required to open a proposal without admin.
 *
 * Initiate is the first non-zero rung on ACCESS_TIERS — a "staked tier" in
 * §4.3's language, not drive-by governance spam from a zero-stake account.
 */
export const PROPOSAL_MIN_STAKE = ACCESS_TIERS.find((t) => t.name === 'Initiate')!.minStake;

export interface ProposalRecord {
  id: string;
  kind: ProposalKind;
  body: Record<string, unknown>;
  status: ProposalStatus;
  opensAt: Date;
  closesAt: Date;
  createdAt: Date;
}

export interface VoteRecord {
  id: string;
  proposalId: string;
  userId: string;
  /** Snapshotted `stakeOf` at cast time — not re-read at tally. */
  weight: Amount;
  choice: VoteChoice;
  castAt: Date;
}

export interface ProposalTally {
  forWeight: Amount;
  againstWeight: Amount;
  abstainWeight: Amount;
  totalWeight: Amount;
  voterCount: number;
}

export interface ProposalDetail extends ProposalRecord {
  tally: ProposalTally;
}

export interface TokenServiceOptions {
  assetId?: string;
  /**
   * Test override. Production loads emission from `token_params` (T-02).
   * When `loadParamsFromDb` is false, this is required.
   */
  emission?: EmissionParams;
  /**
   * Test override. Production loads buyback from `token_params` (T-02).
   * When `loadParamsFromDb` is false, this is required.
   */
  buyback?: BuybackParams;
  /**
   * How long a loaded fee-discount schedule stays good, in ms (default 60s).
   *
   * The schedule is a governed row that changes on the order of months, and `accessOf` is on
   * every gate in the OS — re-reading it per call would be a query per gate. A minute is the
   * lag a `fee_param` proposal takes to reach traffic, which is well inside the window
   * governance already operates on. 0 disables the cache, which is what the tests use.
   */
  feeScheduleTtlMs?: number;
  /**
   * Production default true: buyback + emission params come from `token_params`.
   * Tests set false and inject `emission` / `buyback` so pure service tests need no DB row.
   */
  loadParamsFromDb?: boolean;
}

/** One frozen line of a yield window's plan: who is owed what, and whether it has posted. */
export interface YieldPlanRow {
  userId: string;
  amount: Amount;
  /** Null until the `rewardPay` for this row has returned. */
  ledgerTxId: string | null;
}

export interface YieldRunResult {
  windowId: string;
  /** Value moved BY THIS RUN. A re-run that posts nothing reports zero. */
  distributed: Amount;
  /** Stakers paid BY THIS RUN. */
  recipients: number;
  /** Stakers whose share rounded to nothing when the window was planned. */
  skipped: number;
  /** Planned rows this run found already posted — the resumability signal. */
  alreadyPaid: number;
}

export interface StakeRecord {
  id: string;
  userId: string;
  amount: Amount;
  tier: StakeTier;
  startedAt: Date;
  unlocksAt: Date | null;
  /** `pending` = claim row not yet funded; shown so clients can retry the same stakeId. */
  status: 'pending' | 'active' | 'unstaking' | 'closed';
}

export class TokenService {
  private readonly assetId: string;
  private readonly feeScheduleTtlMs: number;
  private readonly loadParamsFromDb: boolean;
  private feeScheduleCache: { schedule: FeeDiscountSchedule; loadedAt: number } | null = null;
  private buybackParamsCache: { params: BuybackParams; loadedAt: number } | null = null;
  private emissionParamsCache: { params: EmissionParams; loadedAt: number } | null = null;

  constructor(
    private readonly sql: Sql,
    private readonly ledger: LedgerClient,
    private readonly bus: EventBus,
    private readonly options: TokenServiceOptions,
  ) {
    this.assetId = options.assetId ?? 'IFC';
    this.feeScheduleTtlMs = options.feeScheduleTtlMs ?? 60_000;
    this.loadParamsFromDb = options.loadParamsFromDb !== false;
    if (!this.loadParamsFromDb) {
      if (!options.emission || !options.buyback) {
        throw new Error('TokenService test mode requires emission and buyback overrides when loadParamsFromDb is false');
      }
    }
  }

  // ── Staking (§4.3) ─────────────────────────────────────────────────────────

  /**
   * Open a stake.
   *
   * L3-2 ordering: **claim `pending` row → ledger post → activate**.
   *
   * - `pending` is not counted by `stakeOf` and is not yield-eligible, so a
   *   claim without funding cannot create an unfunded obligation.
   * - Ledger post is idempotent on `stakeId`; retry after a crash mid-flight
   *   re-posts (no-op) and activates.
   * - If the ledger refuses (insufficient funds), the pending row is deleted
   *   so we leave no stake record behind — same guarantee the old ledger-first
   *   path advertised, without the crash window of "money moved, no row".
   */
  async stake(input: { userId: string; amount: Amount; tier: StakeTier; stakeId?: string }): Promise<StakeRecord> {
    const stakeId = input.stakeId ?? crypto.randomUUID();

    return withMoneySpan(
      'token.stake',
      { operation: 'stake', userId: input.userId, amount: formatAmount(input.amount), tier: input.tier },
      async () => {
        const startedAt = new Date();
        const unlocksAt = unlockDate(input.tier, startedAt);

        // Claim-before-post: insert pending, or on conflict re-load and refuse
        // amount/user/tier mismatches (same class as pay.deposit_conflict).
        // Never post the caller's amount against another row's identity.
        const claimed = await this.claimStakePending({
          stakeId,
          userId: input.userId,
          amount: input.amount,
          tier: input.tier,
          startedAt,
          unlocksAt,
        });

        if (claimed.status === 'active' || claimed.status === 'unstaking' || claimed.status === 'closed') {
          // Exact retry of an already-finished stake — return the book row, do not re-post.
          return claimed;
        }

        try {
          await this.ledger.post(
            recipes.stake({
              stakeId: claimed.id,
              userId: claimed.userId,
              assetId: this.assetId,
              amount: claimed.amount,
              tier: claimed.tier,
            }),
          );
        } catch (err) {
          await this.sql`
            DELETE FROM token.stakes WHERE id = ${claimed.id} AND status = 'pending'
          `;
          throw err;
        }

        await this.sql`
          UPDATE token.stakes SET status = 'active' WHERE id = ${claimed.id} AND status = 'pending'
        `;

        await this.bus.publish(
          'stakeCreated',
          {
            stakeId: claimed.id,
            userId: claimed.userId,
            amount: formatAmount(claimed.amount),
            tier: claimed.tier,
            unlocksAt: claimed.unlocksAt?.toISOString() ?? null,
          },
          { idempotencyKey: `token.stake:${claimed.id}` },
        );

        return {
          id: claimed.id,
          userId: claimed.userId,
          amount: claimed.amount,
          tier: claimed.tier,
          startedAt: claimed.startedAt,
          unlocksAt: claimed.unlocksAt,
          status: 'active' as const,
        };
      },
    );
  }

  /**
   * Insert a pending stake claim, or load the existing row on retry.
   * Mismatched user/amount/tier on the same stakeId is a hard conflict.
   */
  private async claimStakePending(input: {
    stakeId: string;
    userId: string;
    amount: Amount;
    tier: StakeTier;
    startedAt: Date;
    unlocksAt: Date | null;
  }): Promise<StakeRecord> {
    const inserted = await this.sql<
      Array<{ id: string; user_id: string; amount: string; tier: StakeTier; started_at: Date; unlocks_at: Date | null; status: string }>
    >`
      INSERT INTO token.stakes (id, user_id, amount, tier, multiplier_bps, started_at, unlocks_at, status)
      VALUES (
        ${input.stakeId}, ${input.userId}, ${formatAmount(input.amount)}::numeric, ${input.tier},
        ${STAKE_TIERS[input.tier].multiplierBps}, ${input.startedAt}, ${input.unlocksAt}, 'pending'
      )
      ON CONFLICT (id) DO NOTHING
      RETURNING id, user_id, amount, tier, started_at, unlocks_at, status
    `;
    if (inserted[0]) {
      const row = inserted[0];
      return {
        id: row.id,
        userId: row.user_id,
        amount: parseAmount(row.amount),
        tier: row.tier,
        startedAt: row.started_at,
        unlocksAt: row.unlocks_at,
        status: row.status as StakeRecord['status'],
      };
    }

    const rows = await this.sql<
      Array<{ id: string; user_id: string; amount: string; tier: StakeTier; started_at: Date; unlocks_at: Date | null; status: string }>
    >`
      SELECT id, user_id, amount, tier, started_at, unlocks_at, status
        FROM token.stakes WHERE id = ${input.stakeId} FOR UPDATE
    `;
    const existing = rows[0];
    if (!existing) {
      throw new TokenError(`Stake ${input.stakeId} disappeared after conflict`, 'token.stake_not_found');
    }

    const amount = parseAmount(existing.amount);
    const mismatch = existing.user_id !== input.userId || amount !== input.amount || existing.tier !== input.tier;
    if (mismatch) {
      throw new TokenError(
        `Stake ${input.stakeId} was already claimed as ${formatAmount(amount)} ${existing.tier} by ${existing.user_id}`,
        'token.stake_conflict',
      );
    }

    return {
      id: existing.id,
      userId: existing.user_id,
      amount,
      tier: existing.tier,
      startedAt: existing.started_at,
      unlocksAt: existing.unlocks_at,
      status: existing.status as StakeRecord['status'],
    };
  }

  /**
   * Close a stake and return the principal.
   *
   * The lock is enforced here AND the row is locked for the duration, so two
   * concurrent unstake calls cannot both post to the ledger. Without the row
   * lock the ledger's idempotency key would catch the double-post — but the
   * caller would get an inconsistent answer, and relying on the last line of
   * defence for ordinary correctness is how the last line stops being one.
   */
  async unstake(stakeId: string, now: Date = new Date()): Promise<StakeRecord> {
    return withMoneySpan('token.unstake', { operation: 'unstake' }, async () => this.unstakeInner(stakeId, now));
  }

  /**
   * Close a stake: **claim `unstaking` → ledger unstake → `closed`** (M-04).
   *
   * Ledger-first left a window where principal was already available while
   * stakeOf still counted the row. Claiming `unstaking` first (short txn)
   * drops the row from stakeOf (active-only) before the ledger moves.
   * Ledger key `token.unstake:${stakeId}` makes crash mid-flight retry-safe.
   * Never hold FOR UPDATE across a remote ledger.post.
   */
  private async unstakeInner(stakeId: string, now: Date): Promise<StakeRecord> {
    const claimed = await transaction(
      this.sql,
      async (tx) => {
        const rows = await tx<
          Array<{ id: string; user_id: string; amount: string; tier: StakeTier; started_at: Date; unlocks_at: Date | null; status: string }>
        >`
          SELECT id, user_id, amount, tier, started_at, unlocks_at, status
            FROM token.stakes WHERE id = ${stakeId} FOR UPDATE
        `;

        const row = rows[0];
        if (!row) throw new TokenError(`Stake ${stakeId} not found`, 'token.stake_not_found');
        if (row.status === 'closed') throw new TokenError('Stake is already closed', 'token.stake_closed');
        if (row.status === 'pending') {
          throw new TokenError('Stake is still pending funding — cannot unstake', 'token.stake_locked');
        }
        if (row.status !== 'active' && row.status !== 'unstaking') {
          throw new TokenError(`Stake is not unstakable (status=${row.status})`, 'token.stake_closed');
        }

        if (row.status === 'active' && !isUnlocked(row.tier, row.started_at, now)) {
          throw new TokenError(`Stake is locked until ${row.unlocks_at?.toISOString() ?? 'unlock'} (${row.tier})`, 'token.stake_locked');
        }

        if (row.status === 'active') {
          await tx`UPDATE token.stakes SET status = 'unstaking' WHERE id = ${stakeId} AND status = 'active'`;
        }

        return {
          id: stakeId,
          userId: row.user_id,
          amount: parseAmount(row.amount),
          tier: row.tier,
          startedAt: row.started_at,
          unlocksAt: row.unlocks_at,
        };
      },
      { isolation: 'read committed', maxAttempts: 5 },
    );

    await this.ledger.post(
      recipes.unstake({
        stakeId: claimed.id,
        userId: claimed.userId,
        assetId: this.assetId,
        amount: claimed.amount,
        tier: claimed.tier,
      }),
    );

    // Close is conditional so concurrent unstakes cannot both report success.
    // Ledger key is idempotent (second post is a no-op); only one UPDATE from
    // `unstaking` → `closed` may win. Losers see 0 rows and refuse — crash
    // recovery still works: a lone retry on an `unstaking` row posts (no-op if
    // already applied) and closes.
    const closed = await this.sql<
      Array<{ id: string; user_id: string; amount: string; tier: StakeTier; started_at: Date; unlocks_at: Date | null; status: string }>
    >`
      UPDATE token.stakes
         SET status = 'closed'
       WHERE id = ${claimed.id} AND status = 'unstaking'
   RETURNING id, user_id, amount, tier, started_at, unlocks_at, status
    `;

    if (closed.length === 0) {
      throw new TokenError('Stake is already closed', 'token.stake_closed');
    }

    const done = closed[0]!;
    return {
      id: done.id,
      userId: done.user_id,
      amount: parseAmount(done.amount),
      tier: done.tier,
      startedAt: done.started_at,
      unlocksAt: done.unlocks_at,
      status: 'closed' as const,
    };
  }

  /**
   * Total active stake for a user — the number every other module gates on
   * (§4.3: launchpad allocations, OTC access, premium lobbies, vendor slots).
   */
  async stakeOf(userId: string): Promise<Amount> {
    const rows = await this.sql<Array<{ total: string }>>`
      SELECT COALESCE(SUM(amount), 0) AS total FROM token.stakes WHERE user_id = ${userId} AND status = 'active'
    `;
    return parseAmount(rows[0]?.total ?? '0');
  }

  /** One stake by id — used by the router to enforce ownership before unstake. */
  async getStake(stakeId: string): Promise<StakeRecord | null> {
    const rows = await this.sql<
      Array<{ id: string; user_id: string; amount: string; tier: StakeTier; started_at: Date; unlocks_at: Date | null; status: string }>
    >`
      SELECT id, user_id, amount, tier, started_at, unlocks_at, status
        FROM token.stakes WHERE id = ${stakeId}
    `;
    const row = rows[0];
    if (!row) return null;
    // Include `pending` so a client can discover an in-flight claim and retry
    // the same stakeId (M-02 recovery). Unstake still refuses non-active rows.
    if (row.status !== 'active' && row.status !== 'unstaking' && row.status !== 'closed' && row.status !== 'pending') {
      return null;
    }
    return {
      id: row.id,
      userId: row.user_id,
      amount: parseAmount(row.amount),
      tier: row.tier,
      startedAt: row.started_at,
      unlocksAt: row.unlocks_at,
      status: row.status as StakeRecord['status'],
    };
  }

  /**
   * Stakes owned by a user. Defaults to active only.
   * `all` includes pending so a crash mid-stake is visible for retry (M-02).
   */
  async listStakes(userId: string, status: 'active' | 'closed' | 'pending' | 'all' = 'active'): Promise<StakeRecord[]> {
    const rows =
      status === 'all'
        ? await this.sql<
            Array<{
              id: string;
              user_id: string;
              amount: string;
              tier: StakeTier;
              started_at: Date;
              unlocks_at: Date | null;
              status: string;
            }>
          >`
            SELECT id, user_id, amount, tier, started_at, unlocks_at, status
              FROM token.stakes
             WHERE user_id = ${userId} AND status IN ('pending', 'active', 'unstaking', 'closed')
             ORDER BY started_at DESC, id ASC
          `
        : await this.sql<
            Array<{
              id: string;
              user_id: string;
              amount: string;
              tier: StakeTier;
              started_at: Date;
              unlocks_at: Date | null;
              status: string;
            }>
          >`
            SELECT id, user_id, amount, tier, started_at, unlocks_at, status
              FROM token.stakes
             WHERE user_id = ${userId} AND status = ${status}
             ORDER BY started_at DESC, id ASC
          `;

    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      amount: parseAmount(row.amount),
      tier: row.tier,
      startedAt: row.started_at,
      unlocksAt: row.unlocks_at,
      status: row.status as StakeRecord['status'],
    }));
  }

  /**
   * The published fee-decay schedule (§4.3), read from `token_params`.
   *
   * The row is the authority, not `DEFAULT_FEE_DISCOUNT_SCHEDULE` — §4.3 hands parameter
   * control to governance (`proposal_kind = 'fee_param'`), and a constant compiled into the
   * service is a parameter governance cannot reach. The constant is only what seeded this row.
   *
   * There is deliberately NO fallback to the constant when the row is unreadable. Falling back
   * would mean charging a discount the database does not hold and doing it silently, which is
   * exactly the divergence this method was added to close; a missing params row is a
   * misconfigured deployment and should say so.
   */
  async feeDiscountSchedule(now: number = Date.now()): Promise<FeeDiscountSchedule> {
    const cached = this.feeScheduleCache;
    if (cached && this.feeScheduleTtlMs > 0 && now - cached.loadedAt < this.feeScheduleTtlMs) return cached.schedule;

    const rows = await this.sql<Array<{ fee_discount_schedule: unknown }>>`
      SELECT fee_discount_schedule FROM token.token_params WHERE id = true
    `;

    const raw = rows[0]?.fee_discount_schedule;
    if (raw === undefined) throw new TokenError('token_params singleton row is missing — run migrations', 'token.params_missing');

    const schedule = parseFeeDiscountSchedule(raw);
    this.feeScheduleCache = { schedule, loadedAt: now };
    return schedule;
  }

  /**
   * Buyback split params from `token_params` (T-02). Defaults in source are seed only.
   */
  async buybackParams(now: number = Date.now()): Promise<BuybackParams> {
    if (!this.loadParamsFromDb) return this.options.buyback!;
    const cached = this.buybackParamsCache;
    if (cached && this.feeScheduleTtlMs > 0 && now - cached.loadedAt < this.feeScheduleTtlMs) return cached.params;

    const rows = await this.sql<Array<{ buyback_bps: string; burn_split_bps: string }>>`
      SELECT buyback_bps::text, burn_split_bps::text FROM token.token_params WHERE id = true
    `;
    if (rows.length === 0) throw new TokenError('token_params singleton row is missing — run migrations', 'token.params_missing');
    const params: BuybackParams = {
      buybackBps: Number(rows[0]!.buyback_bps),
      burnSplitBps: Number(rows[0]!.burn_split_bps),
    };
    if (!Number.isInteger(params.buybackBps) || params.buybackBps < 0 || params.buybackBps > 10_000) {
      throw new TokenError(`token_params.buyback_bps out of range: ${params.buybackBps}`, 'token.params_invalid');
    }
    if (!Number.isInteger(params.burnSplitBps) || params.burnSplitBps < 0 || params.burnSplitBps > 10_000) {
      throw new TokenError(`token_params.burn_split_bps out of range: ${params.burnSplitBps}`, 'token.params_invalid');
    }
    this.buybackParamsCache = { params, loadedAt: now };
    return params;
  }

  /**
   * Emission curve from `token_params` (T-02). Code defaults are not live authority.
   */
  async emissionParams(now: number = Date.now()): Promise<EmissionParams> {
    if (!this.loadParamsFromDb) return this.options.emission!;
    const cached = this.emissionParamsCache;
    if (cached && this.feeScheduleTtlMs > 0 && now - cached.loadedAt < this.feeScheduleTtlMs) return cached.params;

    const rows = await this.sql<Array<{ total_supply: string; halving_interval: number; emission_curve: unknown }>>`
      SELECT total_supply::text, halving_interval, emission_curve FROM token.token_params WHERE id = true
    `;
    if (rows.length === 0) throw new TokenError('token_params singleton row is missing — run migrations', 'token.params_missing');
    const row = rows[0]!;
    const curve = row.emission_curve;
    if (curve === null || typeof curve !== 'object' || Array.isArray(curve)) {
      throw new TokenError('token_params.emission_curve is missing or not an object', 'token.params_invalid');
    }
    const curveObj = curve as Record<string, unknown>;
    const initialRaw = curveObj.initialEpochReward;
    if (typeof initialRaw !== 'string' && typeof initialRaw !== 'number') {
      throw new TokenError('token_params.emission_curve.initialEpochReward is required', 'token.params_invalid');
    }
    const params: EmissionParams = {
      initialEpochReward: parseAmount(String(initialRaw)),
      halvingIntervalEpochs: Number(row.halving_interval),
      maxSupply: parseAmount(row.total_supply),
    };
    if (!Number.isInteger(params.halvingIntervalEpochs) || params.halvingIntervalEpochs < 1) {
      throw new TokenError(`token_params.halving_interval invalid: ${params.halvingIntervalEpochs}`, 'token.params_invalid');
    }
    this.emissionParamsCache = { params, loadedAt: now };
    return params;
  }

  async accessOf(userId: string) {
    const [staked, schedule] = await Promise.all([this.stakeOf(userId), this.feeDiscountSchedule()]);
    return { staked, tier: accessTierFor(staked), feeDiscountBps: feeDiscountBps(staked, schedule) };
  }

  // ── Real yield (§4.3) ──────────────────────────────────────────────────────

  /**
   * Distribute a window's platform revenue to stakers, pro-rata by stake ×
   * multiplier.
   *
   * "Real revenue, not emissions" — the value comes from `houseFees`, swept
   * into the rewards engine and paid out. Nothing is minted here.
   *
   * ── THIS IS NOT THE §4.3 WEEKLY JOB (§13 socket `token.yield`) ─────────────
   *
   * §4.3 specifies a weekly job that aggregates house fee accounts per asset.
   * That job does not exist. This method has no caller in the repo outside its
   * own tests: no cron, no bus subscriber, no admin form. It runs when a human
   * holding admin:treasury + MFA calls the tRPC mutation, and otherwise never.
   *
   * `input.sources` is therefore trusted operator input. The router validates
   * decimal shape only; nothing here compares the claimed amount against the
   * `houseFees` balance it says it is sweeping, so an operator can under-sweep,
   * over-sweep or invent a windowId (audit T-03). The maths below is exact and
   * the postings are correct — the number they are exact ABOUT is typed by a
   * person. Describe this as an operator settlement, never as a flywheel.
   *
   * Each payout is its OWN ledger transaction keyed on (window, user), so a
   * crash halfway through is resumable: re-running pays only whoever was
   * missed. A single giant transaction would be atomic but unresumable, and
   * with thousands of stakers that is the worse trade.
   */
  async distributeRevenue(input: {
    windowId: string;
    /** Fees to sweep in, per source module. */
    sources: ReadonlyArray<{ module: string; amount: Amount }>;
  }): Promise<YieldRunResult> {
    return withMoneySpan('token.distributeRevenue', { operation: 'yield', windowId: input.windowId }, async (span) => {
      const result = await this.distributeRevenueInner(input);
      span.setAttribute('intafaced.recipients', result.recipients);
      span.setAttribute('intafaced.distributed', formatAmount(result.distributed));
      span.setAttribute('intafaced.already_paid', result.alreadyPaid);
      return result;
    });
  }

  private async distributeRevenueInner(input: {
    windowId: string;
    sources: ReadonlyArray<{ module: string; amount: Amount }>;
  }): Promise<YieldRunResult> {
    /**
     * Collapse sources by module BEFORE sweeping or planning.
     *
     * The sweep ledger key is `token.fee.sweep:${windowId}:${module}:${asset}` —
     * one post per (window, module). Two legs for the same module used to
     * produce total = a+b while only the first post moved money (the second hit
     * the idempotency key and became a silent no-op). The plan then paid against
     * a figure larger than what the rewards engine actually held.
     *
     * Summing first makes one post of the full module amount, so plan total and
     * value swept agree. Duplicate modules on the wire are operator noise, not
     * two independent sweeps.
     */
    const byModule = new Map<string, Amount>();
    for (const source of input.sources) {
      if (source.amount <= 0n) continue;
      byModule.set(source.module, (byModule.get(source.module) ?? 0n) + source.amount);
    }

    for (const [module, amount] of byModule) {
      await this.ledger.post(
        recipes.sweepFeesToRewards({
          windowId: input.windowId,
          sourceModule: module,
          assetId: this.assetId,
          amount,
        }),
      );
    }

    const total = [...byModule.values()].reduce((acc, a) => acc + a, 0n);
    if (total <= 0n) throw new TokenError('No revenue to distribute for this window', 'token.nothing_to_distribute');

    const plan = await this.planYieldWindow(input.windowId, total);

    if (plan.rows.length === 0) {
      // Nothing staked when this window was planned. The revenue stays in the
      // rewards engine for the next window rather than being stranded or
      // returned — it is already ours. No plan row is written, so a later run
      // once somebody IS staked plans the window then and pays it out of the
      // revenue still sitting there.
      return { windowId: input.windowId, distributed: 0n, recipients: 0, skipped: plan.skipped, alreadyPaid: 0 };
    }

    let distributed = 0n;
    let recipients = 0;
    let alreadyPaid = 0;

    for (const row of plan.rows) {
      // A row that already carries a ledger transaction is not re-posted and,
      // just as importantly, is not COUNTED. Reporting a no-op post as a fresh
      // payout made a re-run tell the operator the window had paid out twice —
      // in the only channel the operator has.
      if (row.ledgerTxId !== null) {
        alreadyPaid++;
        continue;
      }

      const posted = await this.ledger.post(
        recipes.rewardPay({
          rewardId: `yield:${input.windowId}:${row.userId}`,
          userId: row.userId,
          assetId: this.assetId,
          amount: row.amount,
          reason: 'token.yield.distributed',
        }),
      );

      // After the post, never before: a row that says "paid" must have a
      // transaction to point at, which is what `yield_payouts_paid_has_tx_ck`
      // enforces regardless of what this code does. A crash between the post
      // and this update leaves the row unpaid; the retry re-posts (idempotent
      // on the same key) and lands the same transaction id.
      //
      // Conditional UPDATE is also the concurrent-call honesty gate: two
      // operators settling the same unpaid plan both see ledgerTxId=null, both
      // post (second is a ledger no-op), but only one UPDATE from paid_at IS
      // NULL can win. The loser must not report a fresh payout in
      // distributed/recipients — that is the same operator-channel lie #1076
      // closed for sequential re-runs via alreadyPaid.
      const marked = await this.sql<Array<{ user_id: string }>>`
        UPDATE token.yield_payouts
           SET ledger_tx_id = ${posted.id}, paid_at = now()
         WHERE window_id = ${input.windowId} AND user_id = ${row.userId} AND paid_at IS NULL
     RETURNING user_id
      `;
      if (marked.length === 0) {
        alreadyPaid++;
        continue;
      }

      distributed += row.amount;
      recipients++;
    }

    return { windowId: input.windowId, distributed, recipients, skipped: plan.skipped, alreadyPaid };
  }

  /**
   * WHO THIS WINDOW PAYS — decided once, then read.
   *
   * The recipient list used to be recomputed from `token.stakes WHERE status =
   * 'active'` on every call, which made the method's own resumability promise
   * false: a re-run after a new stake opened produced a LARGER list, the
   * already-paid users' `(window, user)` keys were spent so their posts became
   * silent no-ops, and the newcomer's key was fresh — so the newcomer was paid
   * in full out of a window that had already been distributed to the attounit.
   * The value came out of the rewards engine, which is a `house` account: it
   * either drains some other window's undistributed revenue or dies mid-loop on
   * a hard non-negative CHECK, leaving the window half paid.
   *
   * Freezing the plan is the same claim-before-post shape `stake` (0001) and
   * `recordBuyback` (0002) already use, applied to the one thing that was never
   * claimed. It decides no economic number — it records the answer the existing
   * pro-rata maths gives, at the moment it is first asked.
   *
   * The advisory lock covers the read-then-write: two operators invoking the
   * same window at the same instant would otherwise both compute a plan, and
   * `ON CONFLICT DO NOTHING` would merge two plans into one whose rows sum to
   * more than the window swept.
   */
  private async planYieldWindow(windowId: string, total: Amount): Promise<{ rows: YieldPlanRow[]; skipped: number }> {
    const existing = await this.readYieldPlan(this.sql, windowId);
    if (existing.length > 0) return { rows: this.assertPlanCoversTotal(windowId, existing, total), skipped: 0 };

    return transaction(
      this.sql,
      async (tx) => {
        // Serialise planning of THIS window only. `hashtext` is stable across
        // sessions, and an xact lock is released by commit or rollback alike, so
        // a crash mid-plan cannot wedge the window.
        await tx`SELECT pg_advisory_xact_lock(hashtext(${`token.yield:${windowId}`})::bigint)`;

        const raced = await this.readYieldPlan(tx, windowId);
        if (raced.length > 0) return { rows: this.assertPlanCoversTotal(windowId, raced, total), skipped: 0 };

        const stakes = await tx<Array<{ user_id: string; amount: string; tier: StakeTier; multiplier_bps: string }>>`
          SELECT user_id, amount, tier, multiplier_bps FROM token.stakes WHERE status = 'active' ORDER BY id ASC
        `;
        if (stakes.length === 0) return { rows: [], skipped: 0 };

        const shares = distributeYield(
          total,
          stakes.map((s) => ({
            userId: s.user_id,
            amount: parseAmount(s.amount),
            tier: s.tier,
            // The multiplier SNAPSHOTTED when the stake opened, not today's
            // table. A staker locked for 12 months bought that multiplier;
            // re-tuning the ladder afterwards must not retroactively change what
            // they earn.
            multiplierBps: Number(s.multiplier_bps),
          })),
        );

        /**
         * Sum shares per user before writing the plan.
         *
         * `distributeYield` returns one share PER STAKE, and a user can hold
         * several (a flex stake and an m12 stake, say). The reward key is per
         * (window, user), so posting each share separately meant the second one
         * hit the ledger's idempotency check and became a silent no-op — the
         * user was underpaid and the remainder sat in the rewards engine.
         *
         * Summing first keeps one payout per user per window, which is also the
         * invariant the key — and now the primary key of `yield_payouts` —
         * already assumed. Found by partner audit.
         */
        const perUser = new Map<string, Amount>();
        for (const share of shares) {
          perUser.set(share.userId, (perUser.get(share.userId) ?? 0n) + share.share);
        }

        const rows: YieldPlanRow[] = [];
        let skipped = 0;

        for (const [userId, amount] of [...perUser.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
          // A share can round to zero for a dust-sized stake. The ledger rejects
          // zero-amount entries by design, so a zero row would be an instruction
          // nothing could ever clear — counted, never written.
          if (amount <= 0n) {
            skipped++;
            continue;
          }
          rows.push({ userId, amount, ledgerTxId: null });
        }

        for (const row of rows) {
          await tx`
            INSERT INTO token.yield_payouts (window_id, user_id, amount)
            VALUES (${windowId}, ${row.userId}, ${formatAmount(row.amount)}::numeric)
          `;
        }

        return { rows, skipped };
      },
      { isolation: 'read committed', maxAttempts: 5 },
    );
  }

  private async readYieldPlan(sql: Sql, windowId: string): Promise<YieldPlanRow[]> {
    const rows = await sql<Array<{ user_id: string; amount: string; ledger_tx_id: string | null }>>`
      SELECT user_id, amount, ledger_tx_id FROM token.yield_payouts
       WHERE window_id = ${windowId} ORDER BY user_id ASC
    `;
    return rows.map((r) => ({ userId: r.user_id, amount: parseAmount(r.amount), ledgerTxId: r.ledger_tx_id }));
  }

  /**
   * A re-run must be the SAME window, not just the same id.
   *
   * `sources` is operator-typed, so a re-run can name a different total — a
   * correction, a typo, a different set of modules. Paying the frozen plan
   * anyway would answer a request nobody made, and re-planning would pay the
   * difference to whoever happens to be staked today. Both are worse than
   * saying so. The same reasoning `bank.loan_principal_mismatch` makes.
   */
  private assertPlanCoversTotal(windowId: string, rows: YieldPlanRow[], total: Amount): YieldPlanRow[] {
    const planned = rows.reduce((acc, r) => acc + r.amount, 0n);
    if (planned !== total) {
      throw new TokenError(
        `Window ${windowId} was already planned to distribute ${formatAmount(planned)} ${this.assetId}, but this call names ` +
          `${formatAmount(total)} — a re-run must carry the same revenue. Use a new window id to distribute a different amount`,
        'token.yield_window_mismatch',
      );
    }
    return rows;
  }

  // ── Operator burn record (§4.3 calls this buyback & burn) ──────────────────

  /**
   * Record an operator-asserted burn.
   *
   * NOTHING IS BOUGHT BACK HERE, and the method name is the §4.3 vocabulary
   * rather than a description of what runs. §13 socket `token.buyback`.
   *
   * - `tokensBought` is a figure the caller types. No market-buy is executed by
   *   this service or any other, so the platform acquires no IFC and creates no
   *   buy pressure. Pricing and execution are svc-trade's job and svc-trade
   *   cannot yet do it.
   * - The only ledger movement is the burn leg, debited from the rewards
   *   engine — value that is already ours. `toRewards` is not a second credit;
   *   it is the remainder, which never moves.
   * - There is no caller: no cron, no bus subscriber, no admin form. An
   *   operator with admin:treasury + MFA invokes the mutation or it never runs.
   * - `buybackBudget()` (economics/buyback.ts) is what would size the spend from
   *   revenue. It is called from nowhere but its own tests.
   *
   * ORDERING (0002, and the reason this method was rewritten): the window is
   * CLAIMED before the burn posts — the same claim -> post -> activate order
   * `stake` uses above, for the same reason. Previously the burn posted first
   * and the row followed `ON CONFLICT (id) DO NOTHING`, while the guard was a
   * unique index on the WINDOW. A new run id over a spent window therefore
   * burned for real and then failed on an index its conflict clause did not
   * name: tokens irreversibly gone, no row, no event, and an opaque 500.
   *
   * Windows are half-open `[from, to)` and may not overlap (0002). This method
   * decides no economic number — not a window length, not a cadence, not a
   * rate. Those are the owner's (see the token-economics ADR).
   *
   * Turning this into the §4.3 flywheel needs a real market-buy against the
   * internal book plus a schedule — a product decision and an svc-trade
   * dependency, not a rename.
   */
  async recordBuyback(input: {
    runId: string;
    /** Typed columns, not a JSON blob — "which runs covered July" is a query. */
    revenueWindow: { from: Date; to: Date };
    revenueTotal: Record<string, string>;
    tokensBought: Amount;
  }): Promise<{ runId: string; burned: Amount; toRewards: Amount }> {
    return withMoneySpan('token.recordBuyback', { operation: 'buyback', amount: formatAmount(input.tokensBought) }, async () =>
      this.recordBuybackInner(input),
    );
  }

  private async recordBuybackInner(input: {
    runId: string;
    revenueWindow: { from: Date; to: Date };
    revenueTotal: Record<string, string>;
    tokensBought: Amount;
  }): Promise<{ runId: string; burned: Amount; toRewards: Amount }> {
    // Validate before anything is claimed and long before anything burns. The
    // DB has a `to > from` check, but reaching it as a raw 23514 would be the
    // same unnamed-500 failure this method was rewritten to remove.
    if (!(input.revenueWindow.from.getTime() < input.revenueWindow.to.getTime())) {
      throw new TokenError(
        `Revenue window [${iso(input.revenueWindow.from)}, ${iso(input.revenueWindow.to)}) is empty or inverted`,
        'token.buyback_window_invalid',
      );
    }

    // A zero (or negative) buy still CLAIMS the revenue window via the GiST
    // exclusion on `[from,to)`. That permanently blocks a later real burn for
    // the same interval while moving nothing — spend the window only when a
    // real size is asserted.
    if (input.tokensBought <= 0n) {
      throw new TokenError(
        'tokensBought must be positive — a zero buy still claims the revenue window and blocks a later real burn',
        'token.buyback_revenue_invalid',
      );
    }

    const revenueTotal = normaliseRevenueTotal(input.revenueTotal);

    const buyback = await this.buybackParams();
    // toBurn + toRewards === tokensBought exactly (splitBuyback derives one side
    // by subtraction). Pure arithmetic over the params — no ledger read — so the
    // final figures are known at claim time and the claimed row is never a
    // placeholder that has to be corrected later.
    const { toBurn, toRewards } = splitBuyback(input.tokensBought, buyback);

    // ── CLAIM ────────────────────────────────────────────────────────────────
    const claimed = await this.claimBuybackWindow({
      runId: input.runId,
      window: input.revenueWindow,
      revenueTotal,
      tokensBought: input.tokensBought,
      toBurn,
      toRewards,
    });

    if (claimed.status === 'settled') {
      // Exact retry of a run that already finished. Return the book row rather
      // than recomputing: what this run actually burned is what the row says,
      // even if the params have moved since. Never re-post.
      return { runId: claimed.id, burned: claimed.burned, toRewards: claimed.toRewards };
    }

    // ── POST ─────────────────────────────────────────────────────────────────
    // The window is ours from here. A crash between claim and settle leaves a
    // `pending` row, which is recoverable — the ledger post is idempotent on
    // `runId`, so the retry re-posts as a no-op and settles.
    if (toBurn > 0n) {
      try {
        await this.ledger.post(
          recipes.burn({ runId: input.runId, assetId: this.assetId, amount: toBurn, from: rewardsEngine(this.assetId) }),
        );
      } catch (err) {
        // The ledger refused, so no value moved and this run never happened.
        // Release the claim or the window would be held hostage by a run that
        // burned nothing — same guarantee `stake` gives its pending row.
        await this.sql`
          DELETE FROM token.buyback_runs WHERE id = ${claimed.id} AND status = 'pending'
        `;
        throw err;
      }
    }

    // ── SETTLE ───────────────────────────────────────────────────────────────
    await this.sql`
      UPDATE token.buyback_runs
         SET status = 'settled', executed_at = now()
       WHERE id = ${claimed.id} AND status = 'pending'
    `;

    await this.bus.publish(
      'buybackExecuted',
      {
        runId: input.runId,
        tokensBought: formatAmount(input.tokensBought),
        tokensBurned: formatAmount(toBurn),
        tokensToRewards: formatAmount(toRewards),
        // Dates do not survive JSON — the event contract carries ISO strings.
        revenueWindow: { from: iso(input.revenueWindow.from), to: iso(input.revenueWindow.to) },
      },
      { idempotencyKey: `token.buyback:${input.runId}` },
    );

    return { runId: input.runId, burned: toBurn, toRewards };
  }

  /**
   * Take ownership of a revenue window, or refuse by name.
   *
   * Deliberately NOT wrapped in an explicit transaction. The overlap guard
   * raises 23P01, and inside a transaction that error would poison the session
   * before we could ask WHICH run already holds the window — so the refusal
   * would lose the only detail that makes it actionable.
   *
   * Mirrors `claimStakePending`: insert, or on an id conflict re-read and refuse
   * a row whose identity does not match what the caller is asking to post.
   */
  private async claimBuybackWindow(input: {
    runId: string;
    window: { from: Date; to: Date };
    revenueTotal: Record<string, string>;
    tokensBought: Amount;
    toBurn: Amount;
    toRewards: Amount;
  }): Promise<{ id: string; status: BuybackRunStatus; burned: Amount; toRewards: Amount }> {
    type Row = {
      id: string;
      revenue_window_from: Date;
      revenue_window_to: Date;
      tokens_bought: string;
      tokens_burned: string;
      tokens_to_rewards: string;
      status: BuybackRunStatus;
    };

    let inserted: Row[];
    try {
      inserted = await this.sql<Row[]>`
        INSERT INTO token.buyback_runs (
          id, revenue_window_from, revenue_window_to, revenue_total,
          tokens_bought, tokens_burned, tokens_to_rewards, status, executed_at
        )
        VALUES (
          ${input.runId}, ${input.window.from}, ${input.window.to},
          ${this.sql.json(input.revenueTotal as never)},
          ${formatAmount(input.tokensBought)}::numeric, ${formatAmount(input.toBurn)}::numeric,
          ${formatAmount(input.toRewards)}::numeric, 'pending', now()
        )
        ON CONFLICT (id) DO NOTHING
        RETURNING id, revenue_window_from, revenue_window_to, tokens_bought, tokens_burned, tokens_to_rewards, status
      `;
    } catch (err) {
      // 23P01 from the non-overlap exclusion constraint — the window, or part of
      // it, is already spent. This is THE refusal the old code reached only
      // after burning. Nothing has moved at this point.
      if (isExclusionViolation(err) || isUniqueViolation(err)) {
        throw await this.windowAlreadyClaimed(input.runId, input.window);
      }
      throw err;
    }

    const row = inserted[0];
    if (row) {
      return {
        id: row.id,
        status: row.status,
        burned: parseAmount(row.tokens_burned),
        toRewards: parseAmount(row.tokens_to_rewards),
      };
    }

    // The id already exists. Re-read it and refuse to post the caller's figures
    // against another run's identity (same class as `token.stake_conflict`).
    const rows = await this.sql<Row[]>`
      SELECT id, revenue_window_from, revenue_window_to, tokens_bought, tokens_burned, tokens_to_rewards, status
        FROM token.buyback_runs WHERE id = ${input.runId} FOR UPDATE
    `;
    const existing = rows[0];
    if (!existing) {
      throw new TokenError(`Buyback run ${input.runId} disappeared after conflict`, 'token.buyback_run_conflict');
    }

    const mismatch =
      existing.revenue_window_from.getTime() !== input.window.from.getTime() ||
      existing.revenue_window_to.getTime() !== input.window.to.getTime() ||
      parseAmount(existing.tokens_bought) !== input.tokensBought;

    if (mismatch) {
      throw new TokenError(
        `Buyback run ${input.runId} was already claimed for [${iso(existing.revenue_window_from)}, ` +
          `${iso(existing.revenue_window_to)}) buying ${formatAmount(parseAmount(existing.tokens_bought))} — ` +
          `refusing to post [${iso(input.window.from)}, ${iso(input.window.to)}) buying ${formatAmount(input.tokensBought)} against it`,
        'token.buyback_run_conflict',
      );
    }

    return {
      id: existing.id,
      status: existing.status,
      burned: parseAmount(existing.tokens_burned),
      toRewards: parseAmount(existing.tokens_to_rewards),
    };
  }

  /** Name the run that already holds the window. A refusal a human can act on. */
  private async windowAlreadyClaimed(runId: string, window: { from: Date; to: Date }): Promise<TokenError> {
    const rows = await this.sql<Array<{ id: string; revenue_window_from: Date; revenue_window_to: Date; status: BuybackRunStatus }>>`
      SELECT id, revenue_window_from, revenue_window_to, status
        FROM token.buyback_runs
       WHERE tstzrange(revenue_window_from, revenue_window_to, '[)')
          && tstzrange(${window.from}, ${window.to}, '[)')
       ORDER BY revenue_window_from
       LIMIT 5
    `;
    const held = rows.map((r) => `${r.id} [${iso(r.revenue_window_from)}, ${iso(r.revenue_window_to)}) ${r.status}`).join(', ');

    return new TokenError(
      `Revenue window [${iso(window.from)}, ${iso(window.to)}) overlaps an already-claimed buyback run, so run ${runId} was refused ` +
        `and NOTHING was burned. Windows are half-open [from, to) and may not overlap. Already claimed: ${held || '(unknown)'}`,
      'token.buyback_window_overlap',
    );
  }

  /** Tokens permanently removed from circulation. */
  async burnedSupply(): Promise<Amount> {
    return (await this.ledger.balance(burnAccount(this.assetId))).amount;
  }

  // ── Emissions (§4.3) ───────────────────────────────────────────────────────

  /**
   * Next sequential epoch that has not been closed yet — what the auto-tick
   * and an operator "mint due" both want. Gaps are not filled: if someone
   * minted epoch 5 first, the next open index is still 6 (mintEpoch itself
   * accepts any unclosed index for operator catch-up).
   */
  async nextEmissionEpoch(): Promise<number> {
    const rows = await this.sql<Array<{ next: number | string }>>`
      SELECT COALESCE(MAX(epoch) + 1, 0) AS next FROM token.emission_epochs WHERE closed = true
    `;
    return Number(rows[0]?.next ?? 0);
  }

  /**
   * Mint an epoch's scheduled emission.
   *
   * svc-token is the ONLY minter. svc-mining-pool (Phase 5) requests an epoch
   * allocation from here; it never mints. The epoch row is the dedupe: a closed
   * epoch cannot be minted twice, and the ledger's idempotency key on
   * `token.emission:<epoch>` is the backstop if this check is ever bypassed.
   */
  async mintEpoch(epoch: number, destination = rewardsEngine(this.assetId)): Promise<{ epoch: number; minted: Amount }> {
    return withMoneySpan('token.mintEpoch', { operation: 'emission', epoch }, async () => this.mintEpochInner(epoch, destination));
  }

  /** Mint the next sequential epoch. Used by the auto-tick and operator surface. */
  async mintNextEpoch(destination = rewardsEngine(this.assetId)): Promise<{ epoch: number; minted: Amount }> {
    const epoch = await this.nextEmissionEpoch();
    return this.mintEpoch(epoch, destination);
  }

  private async mintEpochInner(
    epoch: number,
    destination: ReturnType<typeof rewardsEngine>,
  ): Promise<{
    epoch: number;
    minted: Amount;
  }> {
    // The mint recipe credits `this.assetId`, so a destination keyed to another
    // asset would put this deployment's tokens into a foreign asset's account.
    // The default used to be a hardcoded `rewardsEngine('IFC')` while
    // TOKEN_ASSET_ID is configurable (env.ts) — a testnet running its own symbol
    // minted that symbol into an IFC account. Fixing the default is not enough:
    // an explicit caller can still pass a mismatch, and this is a mint.
    if (destination.assetId !== this.assetId) {
      throw new TokenError(
        `Emission destination is an ${destination.assetId} account but this service mints ${this.assetId}`,
        'token.params_invalid',
      );
    }

    const emission = await this.emissionParams();
    return transaction(
      this.sql,
      async (tx) => {
        // Mints are rare — a cron tick or an operator — and the ceiling below
        // has to read every epoch row, so serialise them rather than reason
        // about two concurrent mints each reading a total that excludes the
        // other. Released by commit or rollback alike.
        await tx`SELECT pg_advisory_xact_lock(hashtext(${`token.mint:${this.assetId}`})::bigint)`;

        const rows = await tx<Array<{ epoch: number; closed: boolean }>>`
          SELECT epoch, closed FROM token.emission_epochs WHERE epoch = ${epoch} FOR UPDATE
        `;
        if (rows[0]?.closed) throw new TokenError(`Epoch ${epoch} is already closed`, 'token.epoch_closed');

        const reward = epochReward(epoch, emission);
        if (reward <= 0n) throw new TokenError('Emission schedule is exhausted', 'token.supply_exhausted');

        // Guard the cap independently of the curve: a mis-tuned parameter must
        // not be able to mint past max supply.
        const cumulative = cumulativeEmission(epoch, emission);
        if (cumulative > emission.maxSupply) {
          throw new TokenError('Emission would exceed max supply', 'token.supply_exhausted');
        }

        /**
         * THE CEILING HAS TO BE MEASURED AGAINST THE BOOK, NOT AGAINST THE PLAN.
         *
         * The guard above asks the CURVE what should have been emitted by this
         * epoch. The curve lives in `token_params.emission_curve` and
         * `token_params.total_supply`, both of which are editable — §4.3 hands
         * parameter control to governance on purpose, and the README's whole
         * argument for the kill-switch is that a curve can be MIS-TUNED and
         * retuned.
         *
         * So the plan can be rewritten under an already-minted supply. Mint
         * epochs 0..k under a generous curve, then lower `initialEpochReward`
         * (or lower `total_supply`) — and `cumulativeEmission(k+1)` recomputes
         * small, passes the cap, and mints again. What was already emitted is
         * nowhere in that comparison. Nothing else catches it either:
         * `emission_epochs_mined_within_scheduled_ck` bounds one ROW against its
         * own schedule, never the total against the cap.
         *
         * The book cannot be retuned. `SUM(mined_amount)` is what this service
         * actually told the ledger to create, and it is the only figure the
         * ceiling can honestly be measured against — "inflation cannot be
         * un-minted" is precisely why this must refuse BEFORE the post.
         */
        const [emitted] = await tx<Array<{ total: string }>>`
          SELECT COALESCE(SUM(mined_amount), 0) AS total FROM token.emission_epochs
        `;
        const alreadyEmitted = parseAmount(emitted?.total ?? '0');
        if (alreadyEmitted + reward > emission.maxSupply) {
          throw new TokenError(
            `Minting epoch ${epoch} would take emitted supply to ${formatAmount(alreadyEmitted + reward)} ${this.assetId}, ` +
              `past the ${formatAmount(emission.maxSupply)} cap — ${formatAmount(alreadyEmitted)} is already emitted`,
            'token.supply_exhausted',
          );
        }

        await this.ledger.post(recipes.mintEmission({ epoch, assetId: this.assetId, amount: reward, destination }));

        await tx`
          INSERT INTO token.emission_epochs (epoch, scheduled_amount, mined_amount, closed)
          VALUES (${epoch}, ${formatAmount(reward)}::numeric, ${formatAmount(reward)}::numeric, true)
          ON CONFLICT (epoch) DO UPDATE SET mined_amount = EXCLUDED.mined_amount, closed = true
        `;

        return { epoch, minted: reward };
      },
      { isolation: 'read committed', maxAttempts: 5 },
    );
  }

  // ── Governance — ballots only (§4.3) ───────────────────────────────────────
  //
  // Everything below records or reads an election. Nothing below decides one,
  // and nothing elsewhere does either: `passed`, `rejected`, `executed` and
  // `cancelled` are declared on the enum and written by no code in this repo.
  // §13 socket `token.governance`. Do not add a status-flip mutation to close
  // this gap — see the note above createProposal in router.ts for why a flip
  // with no action behind it is the worse outcome.

  /**
   * Open a proposal for IFC-weighted voting.
   *
   * Eligibility: operator (`asAdmin`) or a staked-tier holder (Initiate+).
   * Voting weight is never computed here — that is snapshotted per ballot at
   * cast time so later stake changes cannot rewrite a closed election.
   *
   * No ledger recipe: a proposal is rules metadata, not a value movement.
   */
  async createProposal(input: {
    kind: ProposalKind;
    body?: Record<string, unknown>;
    createdBy: string;
    /** Operator path — bypasses the staked-tier gate. */
    asAdmin?: boolean;
    opensAt?: Date;
    closesAt?: Date;
    proposalId?: string;
    now?: Date;
  }): Promise<ProposalRecord> {
    const now = input.now ?? new Date();
    const opensAt = input.opensAt ?? now;
    // Default window: seven days. Fixed ms so a proposal's length does not
    // depend on calendar months or DST (same rule as stake locks).
    const closesAt = input.closesAt ?? new Date(opensAt.getTime() + 7 * 86_400_000);
    if (!(closesAt.getTime() > opensAt.getTime())) {
      throw new TokenError('Proposal window must close after it opens', 'token.proposal_window');
    }

    if (!input.asAdmin) {
      const staked = await this.stakeOf(input.createdBy);
      if (staked < PROPOSAL_MIN_STAKE) {
        throw new TokenError(
          `Creating a proposal requires at least ${formatAmount(PROPOSAL_MIN_STAKE)} IFC staked (or admin)`,
          'token.proposal_not_allowed',
        );
      }
    }

    const id = input.proposalId ?? crypto.randomUUID();
    const body = input.body ?? {};
    /**
     * Open immediately when the window already includes `now`; otherwise draft.
     *
     * THIS IS THE ONLY LINE IN THE REPO THAT SETS A PROPOSAL STATUS, and it runs
     * once, at insert. There is no open job and no operator procedure to flip a
     * draft later, so `draft` is terminal: a proposal created with a future
     * `opensAt` can never be voted on, because castVote requires status='open'.
     * Callers who want a votable proposal must leave `opensAt` unset or set it
     * at or before now.
     *
     * Not fixed here by auto-opening on first read, which would make the window
     * depend on who happened to fetch the row. The fix is the open/close job in
     * §13 socket `token.governance`, together with the tally and executor that
     * are missing for the same reason.
     */
    const status: ProposalStatus = opensAt.getTime() <= now.getTime() && closesAt.getTime() > now.getTime() ? 'open' : 'draft';

    const rows = await this.sql<
      Array<{
        id: string;
        kind: ProposalKind;
        body: Record<string, unknown>;
        status: ProposalStatus;
        opens_at: Date;
        closes_at: Date;
        created_at: Date;
      }>
    >`
      INSERT INTO token.proposals (id, kind, body, status, opens_at, closes_at)
      VALUES (
        ${id}, ${input.kind}, ${this.sql.json(body as never)}, ${status},
        ${opensAt}, ${closesAt}
      )
      RETURNING id, kind, body, status, opens_at, closes_at, created_at
    `;

    const row = rows[0]!;
    return {
      id: row.id,
      kind: row.kind,
      body: (row.body ?? {}) as Record<string, unknown>,
      status: row.status,
      opensAt: row.opens_at,
      closesAt: row.closes_at,
      createdAt: row.created_at,
    };
  }

  /**
   * Cast one ballot. Weight = `stakeOf(userId)` at this instant, stored on the
   * vote row so later stake/unstake cannot amplify or erase a recorded choice.
   *
   * Zero weight is refused (not recorded as a free no-op): IFC-weighted means
   * unstaked accounts do not sit in the electorate.
   */
  async castVote(input: { proposalId: string; userId: string; choice: VoteChoice; now?: Date }): Promise<VoteRecord> {
    const now = input.now ?? new Date();

    return transaction(
      this.sql,
      async (tx) => {
        const proposals = await tx<
          Array<{
            id: string;
            status: ProposalStatus;
            opens_at: Date;
            closes_at: Date;
          }>
        >`
          SELECT id, status, opens_at, closes_at
            FROM token.proposals
           WHERE id = ${input.proposalId}
           FOR UPDATE
        `;

        const proposal = proposals[0];
        if (!proposal) throw new TokenError(`Proposal ${input.proposalId} not found`, 'token.proposal_not_found');
        if (proposal.status !== 'open') {
          throw new TokenError(`Proposal is ${proposal.status}, not open for voting`, 'token.proposal_not_open');
        }
        if (now.getTime() < proposal.opens_at.getTime() || now.getTime() >= proposal.closes_at.getTime()) {
          throw new TokenError('Proposal voting window is not active', 'token.proposal_window');
        }

        // Stake snapshot inside the same transaction as the insert so a
        // concurrent unstake cannot race "read weight → write ballot".
        const stakeRows = await tx<Array<{ total: string }>>`
          SELECT COALESCE(SUM(amount), 0) AS total
            FROM token.stakes
           WHERE user_id = ${input.userId} AND status = 'active'
        `;
        const weight = parseAmount(stakeRows[0]?.total ?? '0');
        if (weight <= 0n) {
          throw new TokenError('No active stake — voting weight is zero', 'token.no_voting_weight');
        }

        const voteId = crypto.randomUUID();
        try {
          const rows = await tx<
            Array<{
              id: string;
              proposal_id: string;
              user_id: string;
              weight: string;
              choice: VoteChoice;
              cast_at: Date;
            }>
          >`
            INSERT INTO token.governance_votes (id, proposal_id, user_id, weight, choice, cast_at)
            VALUES (
              ${voteId}, ${input.proposalId}, ${input.userId},
              ${formatAmount(weight)}::numeric, ${input.choice}, ${now}
            )
            RETURNING id, proposal_id, user_id, weight, choice, cast_at
          `;

          const row = rows[0]!;
          return {
            id: row.id,
            proposalId: row.proposal_id,
            userId: row.user_id,
            weight: parseAmount(row.weight),
            choice: row.choice,
            castAt: row.cast_at,
          };
        } catch (err) {
          // Unique (proposal_id, user_id) — one ballot per member.
          if (isUniqueViolation(err)) {
            throw new TokenError('Already voted on this proposal', 'token.already_voted');
          }
          throw err;
        }
      },
      { isolation: 'read committed', maxAttempts: 5 },
    );
  }

  async listProposals(
    input: {
      status?: ProposalStatus;
      kind?: ProposalKind;
      limit?: number;
    } = {},
  ): Promise<ProposalRecord[]> {
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);

    const rows = await this.sql<
      Array<{
        id: string;
        kind: ProposalKind;
        body: Record<string, unknown>;
        status: ProposalStatus;
        opens_at: Date;
        closes_at: Date;
        created_at: Date;
      }>
    >`
      SELECT id, kind, body, status, opens_at, closes_at, created_at
        FROM token.proposals
       WHERE (${input.status ?? null}::text IS NULL OR status = ${input.status ?? null})
         AND (${input.kind ?? null}::text IS NULL OR kind = ${input.kind ?? null})
       ORDER BY created_at DESC
       LIMIT ${limit}
    `;

    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      body: (row.body ?? {}) as Record<string, unknown>,
      status: row.status,
      opensAt: row.opens_at,
      closesAt: row.closes_at,
      createdAt: row.created_at,
    }));
  }

  /**
   * One proposal plus a tally computed at read time.
   *
   * The tally is a REPORT, not a decision. It is recomputed on every call and
   * stored nowhere, no quorum or threshold is applied to it, and no code
   * consumes it — a proposal whose `forWeight` dwarfs its `againstWeight` stays
   * `open` forever. Anything rendering this must say so; a bare "for vs
   * against" bar reads as an outcome. §13 socket `token.governance`.
   */
  async getProposal(proposalId: string): Promise<ProposalDetail> {
    const rows = await this.sql<
      Array<{
        id: string;
        kind: ProposalKind;
        body: Record<string, unknown>;
        status: ProposalStatus;
        opens_at: Date;
        closes_at: Date;
        created_at: Date;
      }>
    >`
      SELECT id, kind, body, status, opens_at, closes_at, created_at
        FROM token.proposals
       WHERE id = ${proposalId}
    `;

    const row = rows[0];
    if (!row) throw new TokenError(`Proposal ${proposalId} not found`, 'token.proposal_not_found');

    const tallies = await this.sql<Array<{ choice: VoteChoice; weight: string; n: string }>>`
      SELECT choice, COALESCE(SUM(weight), 0)::text AS weight, COUNT(*)::text AS n
        FROM token.governance_votes
       WHERE proposal_id = ${proposalId}
       GROUP BY choice
    `;

    const { forWeight, againstWeight, abstainWeight, voterCount } = foldTally(tallies);

    return {
      id: row.id,
      kind: row.kind,
      body: (row.body ?? {}) as Record<string, unknown>,
      status: row.status,
      opensAt: row.opens_at,
      closesAt: row.closes_at,
      createdAt: row.created_at,
      tally: {
        forWeight,
        againstWeight,
        abstainWeight,
        totalWeight: forWeight + againstWeight + abstainWeight,
        voterCount,
      },
    };
  }
}

/**
 * Fold grouped vote rows into a tally.
 *
 * ACCUMULATES. It used to ASSIGN (`forWeight = w`) while `voterCount` in the
 * very same loop accumulated — two idioms in one loop, correct today only
 * because `GROUP BY choice` happens to yield at most one row per choice. Under
 * assignment, any grouping that returns a choice more than once (per asset, per
 * snapshot, a UNION for delegated weight) silently keeps the LAST row and drops
 * the rest, and dropped weight in a tally is a misreported election.
 *
 * Exported so the invariant is testable at all: with one row per choice the two
 * idioms are indistinguishable from outside, which is exactly why the bug
 * survived. It is not exported for callers — `getProposal` is the caller.
 *
 * The tally remains a REPORT, not a decision. Nothing in this repo closes a
 * proposal; see the note above the governance section.
 */
export function foldTally(rows: Array<{ choice: VoteChoice; weight: string; n: string }>): {
  forWeight: Amount;
  againstWeight: Amount;
  abstainWeight: Amount;
  voterCount: number;
} {
  let forWeight = 0n;
  let againstWeight = 0n;
  let abstainWeight = 0n;
  let voterCount = 0;

  for (const t of rows) {
    const w = parseAmount(t.weight);
    voterCount += Number(t.n);
    if (t.choice === 'for') forWeight += w;
    else if (t.choice === 'against') againstWeight += w;
    else abstainWeight += w;
  }

  return { forWeight, againstWeight, abstainWeight, voterCount };
}

/** postgres.js surfaces PG error codes on `err.code` (string). */
function pgCode(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null || !('code' in err)) return undefined;
  const code = (err as { code: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

function isUniqueViolation(err: unknown): boolean {
  return pgCode(err) === '23505';
}

/**
 * 23P01 `exclusion_violation` — what the non-overlap constraint raises (0002).
 * A different SQLSTATE from a unique violation, so it needs naming separately
 * or it falls through to an unnamed 500, which is the failure mode this whole
 * change exists to remove.
 */
function isExclusionViolation(err: unknown): boolean {
  return pgCode(err) === '23P01';
}

/** Dates are half-open window bounds here; always render them unambiguously. */
function iso(d: Date): string {
  return d.toISOString();
}

/**
 * Asset id sanity, not an asset registry.
 *
 * Deliberately permissive: this service does not own the list of tradable
 * assets, and inventing one here would be inventing product law. It rejects
 * only what cannot be an identifier at all — empty, whitespace-bearing, or
 * absurdly long keys, which are the shapes that indicate a caller sent the
 * wrong structure entirely.
 */
const ASSET_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

/**
 * Validate and canonicalise `revenueTotal` before it reaches jsonb.
 *
 * This column is the audit record of what a run was sized against — the only
 * written answer to "which revenue did we burn against". It was previously
 * `z.record(z.string())` on the wire and written through untouched, so
 * `{"IFC":"not-a-number","USDT":"-999","BTC":"1e400"}` stored cleanly. That is
 * not a cosmetic defect: an unparseable audit figure cannot be reconciled
 * against the ledger later, which is the one thing it is for.
 *
 * Money law (§0.6): decimal strings on the wire, scaled bigint in memory, never
 * a `number`. `parseAmount` is the only thing that decides what a valid amount
 * is, so it is the thing used here — and the value is re-emitted through
 * `formatAmount` so that "1000", "1000.0" and "1000.000" are stored as the one
 * number they are, rather than three spellings of it.
 */
function normaliseRevenueTotal(raw: Record<string, string>): Record<string, string> {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new TokenError('revenueTotal must be an object of assetId → decimal amount string', 'token.buyback_revenue_invalid');
  }

  const out: Record<string, string> = {};

  for (const [assetId, value] of Object.entries(raw)) {
    if (!ASSET_ID_RE.test(assetId)) {
      throw new TokenError(`revenueTotal key ${JSON.stringify(assetId)} is not a usable asset id`, 'token.buyback_revenue_invalid');
    }

    if (typeof value !== 'string') {
      throw new TokenError(
        `revenueTotal[${JSON.stringify(assetId)}] must be a decimal STRING — a ${typeof value} cannot carry money (§0.6)`,
        'token.buyback_revenue_invalid',
      );
    }

    let amount: Amount;
    try {
      amount = parseAmount(value);
    } catch (err) {
      // A MoneyError is neither a TokenError nor a LedgerError, so letting it
      // escape would be another opaque 500. Name it.
      throw new TokenError(
        `revenueTotal[${JSON.stringify(assetId)}] is not a valid amount: ${err instanceof Error ? err.message : String(err)}`,
        'token.buyback_revenue_invalid',
      );
    }

    if (amount < 0n) {
      throw new TokenError(
        `revenueTotal[${JSON.stringify(assetId)}] is negative (${value}) — revenue collected cannot be negative`,
        'token.buyback_revenue_invalid',
      );
    }

    out[assetId] = formatAmount(amount);
  }

  return out;
}
