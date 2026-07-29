import { index, integer, pgSchema, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { amount, bps, createdAt, tstz, updatedAt } from '@intafaced/db';

/**
 * LAUNCH (§8.4 · launchpad raises + vesting).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THERE IS NO BALANCE COLUMN IN THIS FILE.
 *
 * Doctrine §0.6: no module holds its own balance. Every numeric column below is
 * one of:
 *
 *   · a TERM        — what the raise promises (`sale_supply`, `price`, caps,
 *                     `fee_bps`, a tier's `min_stake` and `allocation_cap`)
 *   · a RECORD of a completed movement, written once and never accumulated by a
 *                     job (`contributions.committed`, `allocations.*`)
 *   · a WATERMARK   — how far a vesting schedule has been released
 *                     (`vesting_schedules.released`), which exists so a claim
 *                     knows what it has already paid, not so anyone can spend it
 *
 * "What is escrowed for this raise" is `ledger.balance(raiseSupplyAccount(…))`
 * and `ledger.balance(raiseContributionAccount(…))`. Always. There is nothing
 * here to reconcile a balance against, because there is no balance here.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Money is `numeric(38,18)` everywhere (`amount()`), read into TypeScript as a
 * decimal string, and parsed to a scaled bigint before any arithmetic. No
 * column in this file is, or may become, a float.
 */
export const launch = pgSchema('launch');

/**
 * `presale` sells at a fixed price until the supply runs out; `fair` sells the
 * whole supply pro-rata to whatever was raised, so nobody can be front-run into
 * a worse price than anyone else.
 */
export const raiseModeEnum = launch.enum('raise_mode', ['presale', 'fair']);

/**
 * The raise lifecycle, and the transitions that are allowed:
 *
 *   draft → funding → (succeeded | failed) → settled
 *   draft → cancelled
 *   funding → cancelled
 *
 * `succeeded` and `failed` are the OUTCOME, decided once when the window
 * closes. `settled` means every contributor's ledger transaction has posted.
 * They are separate states because settlement is resumable: a raise that
 * decides its outcome and then crashes must not re-decide it against a
 * different set of contributions on the way back up.
 */
export const raiseStatusEnum = launch.enum('raise_status', ['draft', 'funding', 'succeeded', 'failed', 'settled', 'cancelled']);

export const contributionStatusEnum = launch.enum('contribution_status', ['committed', 'settled', 'refunded']);

export const raises = launch.table(
  'raises',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** The account that owns the supply being sold and receives the proceeds. */
    issuerId: uuid('issuer_id').notNull(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    /** What is being sold. */
    saleAssetId: text('sale_asset_id').notNull(),
    /** What it is priced and paid in. Never equal to `sale_asset_id`. */
    paymentAssetId: text('payment_asset_id').notNull(),
    mode: raiseModeEnum('mode').notNull(),
    status: raiseStatusEnum('status').notNull().default('draft'),
    /** The whole supply on offer. Escrowed before `funding` may begin. */
    saleSupply: amount('sale_supply').notNull(),
    /** Payment units per sale unit. NULL for `fair` — a fair launch has no price until it closes. */
    price: amount('price'),
    /** Below this, the raise fails and every contributor is refunded in full. */
    softCap: amount('soft_cap').notNull(),
    /** Contributions that would cross this are refused at commit time, not clawed back later. */
    hardCap: amount('hard_cap').notNull(),
    /** House commission, taken from what was actually spent. Never from a refund. */
    feeBps: bps('fee_bps').notNull().default('0'),
    opensAt: tstz('opens_at').notNull(),
    closesAt: tstz('closes_at').notNull(),
    /**
     * Vesting terms applied to every allocation, or NULL for immediate delivery.
     * Stored on the raise so a contributor can read them BEFORE committing —
     * §35's whole argument is that lock terms are a published fact, not a
     * surprise discovered after settlement.
     */
    vestCliffDays: integer('vest_cliff_days'),
    vestDurationDays: integer('vest_duration_days'),
    /** Set when the outcome is decided, so a resumed settlement cannot re-decide it. */
    outcomeAt: tstz('outcome_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('raises_slug_idx').on(t.slug),
    index('raises_issuer_idx').on(t.issuerId),
    index('raises_status_idx').on(t.status, t.closesAt),
  ],
);

/**
 * Allocation tiers by `token.stakeOf` (§8.4).
 *
 * A tier is a floor and a ceiling: stake at least `min_stake` and you may
 * commit up to `allocation_cap`. Tiers are per raise rather than global so a
 * project can set its own gate, and `min_stake` is a THRESHOLD read from
 * svc-token — this service never learns anyone's stake balance, only whether it
 * clears a number.
 */
export const raiseTiers = launch.table(
  'raise_tiers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    raiseId: uuid('raise_id')
      .notNull()
      .references(() => raises.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    minStake: amount('min_stake').notNull(),
    /** Per-contributor ceiling in the payment asset. */
    allocationCap: amount('allocation_cap').notNull(),
  },
  (t) => [uniqueIndex('raise_tiers_name_idx').on(t.raiseId, t.name), index('raise_tiers_gate_idx').on(t.raiseId, t.minStake)],
);

/**
 * ONE ROW PER (raise, contributor). Not one per top-up.
 *
 * Every commitment from one person lands in the same escrow account
 * (`raiseContributionAccount`), so the row that tracks it has to be the same
 * shape or the two would disagree. `commit_seq` is what makes each individual
 * top-up idempotent: it is incremented under a row lock and becomes part of the
 * ledger key, so a retried commit produces the same key rather than a second
 * charge.
 */
export const contributions = launch.table(
  'contributions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    raiseId: uuid('raise_id')
      .notNull()
      .references(() => raises.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    /** Total committed by this person to this raise. A record of posted movements. */
    committed: amount('committed').notNull(),
    /** How many top-ups have posted. The next one's ledger key. */
    commitSeq: integer('commit_seq').notNull().default(0),
    /** Which tier admitted them, snapshotted so a later stake change cannot re-gate a commitment. */
    tierName: text('tier_name'),
    status: contributionStatusEnum('status').notNull().default('committed'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('contributions_pk').on(t.raiseId, t.userId),
    index('contributions_raise_idx').on(t.raiseId, t.status),
    index('contributions_user_idx').on(t.userId),
  ],
);

/**
 * What each contributor actually got, decided once at close.
 *
 * Written before the ledger post that carries it out, so the trail always
 * explains the movement rather than being reconstructed from it — the same
 * ordering svc-p2p uses for dispute resolutions. A row here with
 * `settled_at IS NULL` is a settlement that has been decided and not yet paid,
 * which is exactly what a resumed settlement looks for.
 */
export const allocations = launch.table(
  'allocations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    raiseId: uuid('raise_id')
      .notNull()
      .references(() => raises.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    /** What they committed — the amount leaving escrow. */
    contributed: amount('contributed').notNull(),
    /** The part that bought nothing: oversubscription, or price dust. */
    refund: amount('refund').notNull(),
    /** The sale asset they bought. Zero only on a failed raise. */
    saleAmount: amount('sale_amount').notNull(),
    settledAt: tstz('settled_at'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('allocations_pk').on(t.raiseId, t.userId), index('allocations_pending_idx').on(t.raiseId, t.settledAt)],
);

/**
 * A vesting schedule over tokens sitting in PLATFORM escrow (§8.4).
 *
 * `total` is the grant; `released` is how much of it has already been paid out.
 * Neither is a balance anyone can spend — the tokens are in
 * `vestingEscrow(scheduleId, asset)` in the ledger, and `released` exists so a
 * claim knows what it has already done. `release_seq` is the ledger key: it
 * increments with `released` under the same row lock, so two concurrent claims
 * produce one release rather than two amounts computed microseconds apart.
 */
export const vestingSchedules = launch.table(
  'vesting_schedules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** NULL for a team or advisor grant that did not come out of a raise. */
    raiseId: uuid('raise_id').references(() => raises.id, { onDelete: 'set null' }),
    beneficiaryId: uuid('beneficiary_id').notNull(),
    assetId: text('asset_id').notNull(),
    total: amount('total').notNull(),
    released: amount('released').notNull().default('0'),
    releaseSeq: integer('release_seq').notNull().default(0),
    /** Nothing releases before this instant, however much time has passed. */
    cliffAt: tstz('cliff_at').notNull(),
    startAt: tstz('start_at').notNull(),
    endAt: tstz('end_at').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('vesting_beneficiary_idx').on(t.beneficiaryId),
    index('vesting_raise_idx').on(t.raiseId),
    /** One schedule per (raise, beneficiary): a settlement must not create a second. */
    uniqueIndex('vesting_raise_beneficiary_idx').on(t.raiseId, t.beneficiaryId),
  ],
);

export const schema = { raises, raiseTiers, contributions, allocations, vestingSchedules };
