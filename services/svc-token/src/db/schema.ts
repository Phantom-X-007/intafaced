import { boolean, index, integer, jsonb, numeric, pgSchema, primaryKey, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { amount, bps, createdAt, tstz, updatedAt } from '@intafaced/db';

/**
 * THE NATIVE ECONOMY (§4.3).
 *
 * Sources, sinks and the flywheel — as tables. This service's schema, and only
 * this service's schema: svc-token is the *only* minter of IFC (§4.3), so every
 * other service reaches this data through the token API, never through SQL.
 * Doctrine §0.6 and the per-service Postgres roles both enforce it.
 *
 * Balances are NOT here. IFC balances live in svc-ledger like every other
 * asset; these tables hold the *rules* that decide what the ledger is told to
 * post.
 */
export const token = pgSchema('token');

/** §4.3 lock tiers. The tier is what fixes `multiplier_bps` and `unlocks_at`. */
export const stakeTierEnum = token.enum('stake_tier', ['flex', 'm3', 'm12']);

/**
 * `unstaking` is a distinct state, not a flag: an m3/m12 stake that has been
 * asked to unwind still counts for nothing in `stakeOf` but its principal is
 * not yet released, and the two must never be confused.
 */
export const stakeStatusEnum = token.enum('stake_status', ['pending', 'active', 'unstaking', 'closed']);

/** §4.3 governance surface: what an IFC-weighted vote is allowed to decide. */
export const proposalKindEnum = token.enum('proposal_kind', ['listing', 'fee_param', 'curriculum', 'grant']);

/**
 * §4.3 leaves the proposal status open; it is an enum rather than free text so
 * a future tally job and executor can branch on it without a typo silently
 * making a passed proposal un-executable.
 *
 * READ THIS BEFORE BELIEVING THE ENUM. Four of these six values are declared and
 * never written. Nothing in this repo issues `UPDATE token.proposals`: the only
 * status write is the draft/open choice made once at INSERT
 * (token-service.ts:950). There is no tally job, no close job, no quorum, no
 * threshold and no executor, so no proposal has ever moved to `passed`,
 * `rejected`, `executed` or `cancelled` — and none can. `draft` is likewise
 * terminal: a proposal opened with a future `opens_at` can never become `open`,
 * so it can never be voted on.
 *
 * The enum is kept, rather than trimmed to the two reachable values, because
 * the shape is §4.3's and the gap is a missing mechanism, not a wrong column.
 * §13 socket `token.governance` (tooling/tracker/features.mjs) is the record of
 * that decision and of why the outcome half is an owner call, not an agent one.
 */
export const proposalStatusEnum = token.enum('proposal_status', ['draft', 'open', 'passed', 'rejected', 'executed', 'cancelled']);

/** Abstains are recorded, not omitted — quorum maths needs to see them. */
export const voteChoiceEnum = token.enum('vote_choice', ['for', 'against', 'abstain']);

/**
 * Singleton row holding every tunable of the IFC economy (§4.3).
 *
 * These are parameters, not constants, because §4.3 hands parameter control to
 * governance (`proposal_kind = 'fee_param'`). Changing the emission curve or
 * the buyback share must therefore be a row update with an audit trail, never a
 * redeploy. Same one-row shape as svc-ledger's `chain_tip`.
 */
export const tokenParams = token.table('token_params', {
  /** Always `true`. The CHECK in the migration is what makes this a singleton. */
  id: boolean('id').primaryKey().default(true),
  /** Hard cap. The emission scheduler refuses to mint past the sum of it. */
  totalSupply: amount('total_supply').notNull(),
  /**
   * Emission schedule as data (§4.3). jsonb because the curve shape itself is
   * governable — a column per parameter would mean a migration per curve.
   */
  emissionCurve: jsonb('emission_curve').notNull().default({}),
  /** Epochs between reward halvings. Read by the epoch scheduler, not per-post. */
  halvingInterval: integer('halving_interval').notNull(),
  /**
   * The published fee-decay schedule (§4.3): IFC balance/stake thresholds mapped
   * to discount bps. `feeCharge`'s discount branch reads this, so it is versioned
   * data rather than code for the same reason as the curve.
   */
  feeDiscountSchedule: jsonb('fee_discount_schedule').notNull().default({}),
  /** Share of platform revenue per window routed into the buyback (§4.3). */
  buybackBps: bps('buyback_bps').notNull(),
  /** Of the tokens bought back, the share burned; the remainder funds rewards. */
  burnSplitBps: bps('burn_split_bps').notNull(),
  updatedAt: updatedAt(),
});

/**
 * Staked IFC positions (§4.3).
 *
 * The staked principal itself sits in a `stake`-kind ledger account; this row is
 * the *terms* of that stake — tier, multiplier, lock end — which the ledger has
 * no opinion about. `token.stakeOf(userId)` aggregates active rows here to gate
 * launchpad allocations, OTC access, premium lobbies and vendor slots.
 */
export const stakes = token.table(
  'stakes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(),
    amount: amount('amount').notNull(),
    tier: stakeTierEnum('tier').notNull(),
    /**
     * Reward weight, snapshotted at open (10000 = 1x).
     *
     * Copied off the tier rather than looked up at payout time, deliberately: a
     * governance change to tier multipliers must not retroactively re-price
     * stakes that were opened under the old terms.
     */
    multiplierBps: bps('multiplier_bps').notNull(),
    startedAt: tstz('started_at').notNull().defaultNow(),
    /** NULL only for `flex`, which has no lock. Enforced by CHECK in the migration. */
    unlocksAt: tstz('unlocks_at'),
    status: stakeStatusEnum('status').notNull().default('active'),
    createdAt: createdAt(),
  },
  (t) => [
    /** The `stakeOf` read path: every gate in the OS hits this index. */
    index('stakes_user_status_idx').on(t.userId, t.status),
    /**
     * The pro-rata sweep over active stakes. §4.3 calls for a weekly job here;
     * there is no such job — `distributeRevenue` runs only when an operator
     * invokes it by hand (§13 socket `token.yield`). The index serves that
     * manual path today and the job when it is built.
     */
    index('stakes_status_idx').on(t.status),
    /** The unlock sweep asks "what matures next" — ordered by lock end. */
    index('stakes_unlocks_idx').on(t.unlocksAt),
  ],
);

/**
 * The mining emission schedule (§4.3).
 *
 * svc-token owns this table and svc-mining-pool (Phase 5) *requests* allocations
 * against it. Keeping `scheduled_amount` and `mined_amount` on the same row is
 * what lets the database itself refuse to over-mint (CHECK in the migration) —
 * the single most important property of the whole file.
 */
export const emissionEpochs = token.table('emission_epochs', {
  /** Natural key from §4.3 — epochs are a dense sequence, so no surrogate id. */
  epoch: integer('epoch').primaryKey(),
  /** What the curve allows this epoch. Derived from `token_params` at open. */
  scheduledAmount: amount('scheduled_amount').notNull(),
  /** What has actually been minted so far. Never exceeds the scheduled amount. */
  minedAmount: amount('mined_amount').notNull().default('0'),
  /**
   * Pool difficulty target for the epoch. numeric, not a float — precision loss
   * here would silently mis-price every share submitted against it.
   */
  difficulty: numeric('difficulty', { precision: 38, scale: 18 }).notNull().default('1'),
  /** Closed epochs are immutable; the scheduler refuses further allocations. */
  closed: boolean('closed').notNull().default(false),
  createdAt: createdAt(),
});

/**
 * One recorded burn cycle (§4.3 calls this buyback-and-burn).
 *
 * WHAT A ROW ACTUALLY MEANS TODAY. §4.3 specifies "structural, scheduled" —
 * a market-buy of revenue on the internal book, then a split. Neither half is
 * built. `tokens_bought` is a figure an operator types into `recordBuyback`
 * (router.ts:346), `revenue_total` is an unvalidated jsonb blob from the same
 * caller, and the only ledger movement the write causes is the burn leg debited
 * out of the rewards engine. Nothing is purchased, so a row here is an operator
 * assertion with a burn attached, not evidence of buy pressure. §13 socket
 * `token.buyback`.
 *
 * The columns still reconcile against the postings the burn caused (§4.4 exit
 * criteria) — that part holds. What they do not evidence is a buyback.
 */
export const buybackRuns = token.table(
  'buyback_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /**
     * The revenue window this run consumed, half-open [from, to).
     *
     * Stored as two columns rather than a range type so the unique index below
     * can make re-running a window impossible — spending the same revenue twice
     * would mint buy pressure out of nothing.
     */
    revenueWindowFrom: tstz('revenue_window_from').notNull(),
    revenueWindowTo: tstz('revenue_window_to').notNull(),
    /**
     * Per-asset revenue totals for the window, e.g. `{"USDT":"1200.5"}`. jsonb
     * because the asset set is data (svc-ledger seeds it) and grows without a
     * migration here.
     */
    revenueTotal: jsonb('revenue_total').notNull().default({}),
    tokensBought: amount('tokens_bought').notNull(),
    /** Sent to the burn address account. Together with the next column ≤ bought. */
    tokensBurned: amount('tokens_burned').notNull(),
    /** Sent to the rewards-engine account, funding real-yield staking payouts. */
    tokensToRewards: amount('tokens_to_rewards').notNull(),
    executedAt: tstz('executed_at').notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    /** A window is consumed exactly once, ever. See the migration's comment. */
    uniqueIndex('buyback_runs_window_idx').on(t.revenueWindowFrom, t.revenueWindowTo),
    index('buyback_runs_executed_idx').on(t.executedAt),
  ],
);

/**
 * Governance proposals (§4.3) — IFC-weighted, and the vehicle by which §17.3's
 * progressive decentralisation takes parameter control.
 */
export const proposals = token.table(
  'proposals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: proposalKindEnum('kind').notNull(),
    /**
     * The proposal payload — the listing to add, the parameter to change, the
     * grant to fund. Shape varies by `kind`, validated by the zod schema for
     * that kind before insert, so the column itself stays jsonb.
     */
    body: jsonb('body').notNull().default({}),
    status: proposalStatusEnum('status').notNull().default('draft'),
    opensAt: tstz('opens_at').notNull(),
    closesAt: tstz('closes_at').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    /**
     * The query a tally job would run — open proposals whose window has closed.
     * No such job exists (§13 socket `token.governance`), so nothing reads this
     * index today. Kept because the index is right and the job is what is
     * missing, not the shape.
     */
    index('proposals_status_closes_idx').on(t.status, t.closesAt),
    index('proposals_kind_idx').on(t.kind),
  ],
);

/**
 * A single cast vote (§4.3).
 *
 * Weight is stake-derived, so it is money-precision even though it is not money
 * — a rounded vote weight is a mis-counted election.
 */
export const governanceVotes = token.table(
  'governance_votes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    proposalId: uuid('proposal_id')
      .notNull()
      .references(() => proposals.id),
    userId: text('user_id').notNull(),
    /**
     * Voting weight snapshotted when the vote was cast, not read at tally time.
     * Otherwise a voter could stake more after voting and retroactively amplify
     * a ballot already on the record.
     */
    weight: amount('weight').notNull(),
    choice: voteChoiceEnum('choice').notNull(),
    castAt: tstz('cast_at').notNull().defaultNow(),
  },
  (t) => [
    /** The tally reads every vote for one proposal — this is that scan. */
    index('governance_votes_proposal_idx').on(t.proposalId),
    /** One ballot per member per proposal. The anti-ballot-stuffing rule. */
    uniqueIndex('governance_votes_one_per_user_idx').on(t.proposalId, t.userId),
  ],
);

/**
 * THAT A YIELD WINDOW WAS CLAIMED — including empty settlements (0004).
 *
 * `yield_payouts` freezes WHO is paid. This freezes THAT a window id was taken
 * for a given total, so an empty first run cannot be re-planned once somebody
 * stakes. Written once; a re-run with a different total is refused.
 */
export const yieldWindows = token.table('yield_windows', {
  windowId: text('window_id').primaryKey(),
  /** Operator-typed revenue total claimed for this window. Never updated. */
  totalAmount: amount('total_amount').notNull(),
  claimedAt: tstz('claimed_at').notNull().defaultNow(),
});

/**
 * WHO A YIELD WINDOW PAYS — frozen at plan time (0003).
 *
 * Not a balance and not a total: one row is one INSTRUCTION, written once when
 * a window is first distributed and never revised. The value itself is a
 * `rewardPay` transaction in the ledger, which `ledgerTxId` points at.
 *
 * It exists because the recipient list used to be recomputed from today's
 * active stakes on every call, which made `distributeRevenue`'s own
 * resumability promise false: a re-run after a new stake opened paid the
 * newcomer in full out of a window already distributed to the last attounit,
 * because their `(window, user)` reward key was the only one still unspent.
 *
 * An empty settlement writes ZERO rows here but still claims `yield_windows`
 * (0004) so the empty answer is frozen too.
 */
export const yieldPayouts = token.table(
  'yield_payouts',
  {
    windowId: text('window_id').notNull(),
    userId: uuid('user_id').notNull(),
    /** The share owed. Written once — a column that changed would be a running total. */
    amount: amount('amount').notNull(),
    /** Null until the reward post for this row has returned. */
    ledgerTxId: text('ledger_tx_id'),
    paidAt: tstz('paid_at'),
    plannedAt: tstz('planned_at').notNull().defaultNow(),
  },
  (t) => [
    /** One payout per member per window — the pair the reward key already assumed. */
    primaryKey({ columns: [t.windowId, t.userId] }),
    /** The resume query: what this window still owes. */
    index('yield_payouts_unpaid_idx').on(t.windowId),
  ],
);

export const schema = {
  tokenParams,
  stakes,
  emissionEpochs,
  buybackRuns,
  proposals,
  governanceVotes,
  yieldWindows,
  yieldPayouts,
};
