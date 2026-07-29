import type { Sql } from 'postgres';
import { transaction } from '@intafaced/db';
import type { EventBus } from '@intafaced/events';
import { formatAmount, parseAmount, recipes, rewardsEngine, burnAccount, type Amount, type LedgerClient } from '@intafaced/ledger-client';
import {
  STAKE_TIERS,
  accessTierFor,
  feeDiscountBps,
  isUnlocked,
  parseFeeDiscountSchedule,
  stakeWeight,
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
      | 'token.epoch_closed'
      | 'token.supply_exhausted'
      | 'token.nothing_to_distribute'
      | 'token.params_missing',
  ) {
    super(message);
    this.name = 'TokenError';
  }
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
  status: 'active' | 'unstaking' | 'closed';
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

        await this.sql`
          INSERT INTO token.stakes (id, user_id, amount, tier, multiplier_bps, started_at, unlocks_at, status)
          VALUES (
            ${stakeId}, ${input.userId}, ${formatAmount(input.amount)}::numeric, ${input.tier},
            ${STAKE_TIERS[input.tier].multiplierBps}, ${startedAt}, ${unlocksAt}, 'pending'
          )
          ON CONFLICT (id) DO NOTHING
        `;

        try {
          await this.ledger.post(
            recipes.stake({ stakeId, userId: input.userId, assetId: this.assetId, amount: input.amount, tier: input.tier }),
          );
        } catch (err) {
          await this.sql`
            DELETE FROM token.stakes WHERE id = ${stakeId} AND status = 'pending'
          `;
          throw err;
        }

        await this.sql`
          UPDATE token.stakes SET status = 'active' WHERE id = ${stakeId} AND status = 'pending'
        `;

        await this.bus.publish(
          'stakeCreated',
          {
            stakeId,
            userId: input.userId,
            amount: formatAmount(input.amount),
            tier: input.tier,
            unlocksAt: unlocksAt?.toISOString() ?? null,
          },
          { idempotencyKey: `token.stake:${stakeId}` },
        );

        return {
          id: stakeId,
          userId: input.userId,
          amount: input.amount,
          tier: input.tier,
          startedAt,
          unlocksAt,
          status: 'active' as const,
        };
      },
    );
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
}
