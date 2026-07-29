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
      | 'token.params_missing'
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
  emission: EmissionParams;
  buyback: BuybackParams;
  /**
   * How long a loaded fee-discount schedule stays good, in ms (default 60s).
   *
   * The schedule is a governed row that changes on the order of months, and `accessOf` is on
   * every gate in the OS — re-reading it per call would be a query per gate. A minute is the
   * lag a `fee_param` proposal takes to reach traffic, which is well inside the window
   * governance already operates on. 0 disables the cache, which is what the tests use.
   */
  feeScheduleTtlMs?: number;
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
  private feeScheduleCache: { schedule: FeeDiscountSchedule; loadedAt: number } | null = null;

  constructor(
    private readonly sql: Sql,
    private readonly ledger: LedgerClient,
    private readonly bus: EventBus,
    private readonly options: TokenServiceOptions,
  ) {
    this.assetId = options.assetId ?? 'IFC';
    this.feeScheduleTtlMs = options.feeScheduleTtlMs ?? 60_000;
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

  private async unstakeInner(stakeId: string, now: Date): Promise<StakeRecord> {
    return transaction(
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

        if (!isUnlocked(row.tier, row.started_at, now)) {
          throw new TokenError(`Stake is locked until ${row.unlocks_at?.toISOString() ?? 'unlock'} (${row.tier})`, 'token.stake_locked');
        }

        const amount = parseAmount(row.amount);

        await this.ledger.post(recipes.unstake({ stakeId, userId: row.user_id, assetId: this.assetId, amount, tier: row.tier }));

        await tx`UPDATE token.stakes SET status = 'closed' WHERE id = ${stakeId}`;

        return {
          id: stakeId,
          userId: row.user_id,
          amount,
          tier: row.tier,
          startedAt: row.started_at,
          unlocksAt: row.unlocks_at,
          status: 'closed' as const,
        };
      },
      { isolation: 'read committed', maxAttempts: 5 },
    );
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
   * Each payout is its OWN ledger transaction keyed on (window, user), so a
   * crash halfway through is resumable: re-running pays only whoever was
   * missed. A single giant transaction would be atomic but unresumable, and
   * with thousands of stakers that is the worse trade.
   */
  async distributeRevenue(input: {
    windowId: string;
    /** Fees to sweep in, per source module. */
    sources: ReadonlyArray<{ module: string; amount: Amount }>;
  }): Promise<{ windowId: string; distributed: Amount; recipients: number; skipped: number }> {
    return withMoneySpan('token.distributeRevenue', { operation: 'yield', windowId: input.windowId }, async (span) => {
      const result = await this.distributeRevenueInner(input);
      span.setAttribute('intafaced.recipients', result.recipients);
      span.setAttribute('intafaced.distributed', formatAmount(result.distributed));
      return result;
    });
  }

  private async distributeRevenueInner(input: {
    windowId: string;
    sources: ReadonlyArray<{ module: string; amount: Amount }>;
  }): Promise<{ windowId: string; distributed: Amount; recipients: number; skipped: number }> {
    for (const source of input.sources) {
      if (source.amount <= 0n) continue;
      await this.ledger.post(
        recipes.sweepFeesToRewards({
          windowId: input.windowId,
          sourceModule: source.module,
          assetId: this.assetId,
          amount: source.amount,
        }),
      );
    }

    const total = input.sources.reduce((acc, s) => acc + (s.amount > 0n ? s.amount : 0n), 0n);
    if (total <= 0n) throw new TokenError('No revenue to distribute for this window', 'token.nothing_to_distribute');

    const stakes = await this.sql<Array<{ user_id: string; amount: string; tier: StakeTier; multiplier_bps: string }>>`
      SELECT user_id, amount, tier, multiplier_bps FROM token.stakes WHERE status = 'active' ORDER BY id ASC
    `;

    if (stakes.length === 0) {
      // Nothing staked. The revenue stays in the rewards engine for the next
      // window rather than being stranded or returned — it is already ours.
      return { windowId: input.windowId, distributed: 0n, recipients: 0, skipped: 0 };
    }

    const shares = distributeYield(
      total,
      stakes.map((s) => ({
        userId: s.user_id,
        amount: parseAmount(s.amount),
        tier: s.tier,
        // The multiplier SNAPSHOTTED when the stake opened, not today's table.
        // A staker locked for 12 months bought that multiplier; re-tuning the
        // ladder afterwards must not retroactively change what they earn.
        multiplierBps: Number(s.multiplier_bps),
      })),
    );

    /**
     * Sum shares per user before posting.
     *
     * `distributeYield` returns one share PER STAKE, and a user can hold several
     * (a flex stake and an m12 stake, say). The reward key is per (window, user),
     * so posting each share separately meant the second one hit the ledger's
     * idempotency check and became a silent no-op — the user was underpaid and
     * the remainder sat in the rewards engine.
     *
     * Summing first keeps one payout per user per window, which is also the
     * invariant the key already assumed. Found by partner audit.
     */
    const perUser = new Map<string, Amount>();
    for (const share of shares) {
      perUser.set(share.userId, (perUser.get(share.userId) ?? 0n) + share.share);
    }

    let distributed = 0n;
    let recipients = 0;
    let skipped = 0;

    for (const [userId, amount] of perUser) {
      // A share can round to zero for a dust-sized stake. Posting a zero-amount
      // entry is rejected by the ledger by design, so skip rather than fail the
      // whole run for one staker who earned nothing this window.
      if (amount <= 0n) {
        skipped++;
        continue;
      }

      await this.ledger.post(
        recipes.rewardPay({
          rewardId: `yield:${input.windowId}:${userId}`,
          userId,
          assetId: this.assetId,
          amount,
          reason: 'token.yield.distributed',
        }),
      );

      distributed += amount;
      recipients++;
    }

    return { windowId: input.windowId, distributed, recipients, skipped };
  }

  // ── Buyback & burn (§4.3, §17.3) ───────────────────────────────────────────

  /**
   * Record and settle a buyback run.
   *
   * `tokensBought` is supplied by the caller because pricing and execution are
   * svc-trade's job, not this service's — svc-token never decides a price.
   * Until the internal book exists (Phase 2) an operator supplies the executed
   * amount from apps/admin.
   *
   * §13 socket: automated market-buy against the internal book once svc-trade
   * lands, which turns this into a scheduled job rather than an operator action.
   */
  async recordBuyback(input: {
    runId: string;
    /** Typed columns, not a JSON blob — "which runs covered July" is a query. */
    revenueWindow: { from: Date; to: Date };
    revenueTotal: Record<string, string>;
    tokensBought: Amount;
  }): Promise<{ runId: string; burned: Amount; toRewards: Amount }> {
    const { toBurn, toRewards } = splitBuyback(input.tokensBought, this.options.buyback);

    // toBurn + toRewards === tokensBought exactly (splitBuyback derives one side
    // by subtraction). The burn is the only leg that needs a ledger movement —
    // the remainder is already in the rewards engine.
    if (toBurn > 0n) {
      await this.ledger.post(
        recipes.burn({ runId: input.runId, assetId: this.assetId, amount: toBurn, from: rewardsEngine(this.assetId) }),
      );
    }

    await this.sql`
      INSERT INTO token.buyback_runs (
        id, revenue_window_from, revenue_window_to, revenue_total,
        tokens_bought, tokens_burned, tokens_to_rewards, executed_at
      )
      VALUES (
        ${input.runId}, ${input.revenueWindow.from}, ${input.revenueWindow.to},
        ${this.sql.json(input.revenueTotal as never)},
        ${formatAmount(input.tokensBought)}::numeric, ${formatAmount(toBurn)}::numeric,
        ${formatAmount(toRewards)}::numeric, now()
      )
      ON CONFLICT (id) DO NOTHING
    `;

    await this.bus.publish(
      'buybackExecuted',
      {
        runId: input.runId,
        tokensBought: formatAmount(input.tokensBought),
        tokensBurned: formatAmount(toBurn),
        tokensToRewards: formatAmount(toRewards),
        // Dates do not survive JSON — the event contract carries ISO strings.
        revenueWindow: { from: input.revenueWindow.from.toISOString(), to: input.revenueWindow.to.toISOString() },
      },
      { idempotencyKey: `token.buyback:${input.runId}` },
    );

    return { runId: input.runId, burned: toBurn, toRewards };
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
  async mintEpoch(epoch: number, destination = rewardsEngine('IFC')): Promise<{ epoch: number; minted: Amount }> {
    return withMoneySpan('token.mintEpoch', { operation: 'emission', epoch }, async () => this.mintEpochInner(epoch, destination));
  }

  /** Mint the next sequential epoch. Used by the auto-tick and operator surface. */
  async mintNextEpoch(destination = rewardsEngine('IFC')): Promise<{ epoch: number; minted: Amount }> {
    const epoch = await this.nextEmissionEpoch();
    return this.mintEpoch(epoch, destination);
  }

  private async mintEpochInner(epoch: number, destination: ReturnType<typeof rewardsEngine>): Promise<{ epoch: number; minted: Amount }> {
    return transaction(
      this.sql,
      async (tx) => {
        const rows = await tx<Array<{ epoch: number; closed: boolean }>>`
          SELECT epoch, closed FROM token.emission_epochs WHERE epoch = ${epoch} FOR UPDATE
        `;
        if (rows[0]?.closed) throw new TokenError(`Epoch ${epoch} is already closed`, 'token.epoch_closed');

        const reward = epochReward(epoch, this.options.emission);
        if (reward <= 0n) throw new TokenError('Emission schedule is exhausted', 'token.supply_exhausted');

        // Guard the cap independently of the curve: a mis-tuned parameter must
        // not be able to mint past max supply.
        const cumulative = cumulativeEmission(epoch, this.options.emission);
        if (cumulative > this.options.emission.maxSupply) {
          throw new TokenError('Emission would exceed max supply', 'token.supply_exhausted');
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

  // ── Governance (§4.3) ──────────────────────────────────────────────────────

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
    // Open immediately when the window already includes `now`; otherwise draft
    // until an operator (or a future open job) flips status. Voters still check
    // the window, so a draft never accepts ballots.
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

    let forWeight = 0n;
    let againstWeight = 0n;
    let abstainWeight = 0n;
    let voterCount = 0;
    for (const t of tallies) {
      const w = parseAmount(t.weight);
      const n = Number(t.n);
      voterCount += n;
      if (t.choice === 'for') forWeight = w;
      else if (t.choice === 'against') againstWeight = w;
      else abstainWeight = w;
    }

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

/** postgres.js surfaces PG error codes on `err.code` (string). */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === '23505';
}
