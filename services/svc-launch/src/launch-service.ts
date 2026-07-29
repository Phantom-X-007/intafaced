import type { Sql } from 'postgres';
import { transaction } from '@intafaced/db';
import {
  formatAmount,
  parseAmount,
  raiseContributionAccount,
  raiseSupplyAccount,
  recipes,
  sub,
  sum,
  vestingEscrow,
  type Amount,
  type LedgerClient,
} from '@intafaced/ledger-client';
import { LaunchError } from './errors.js';
import { allocate, commitHeadroom, tierFor, type AllocationLine, type RaiseMode } from './raise/allocation.js';
import { claimable, scheduleWindow, type VestingTerms } from './raise/vesting.js';
import type { StakeSource } from './stake-source.js';
import { withMoneySpan } from './tracing.js';

/**
 * LAUNCHPAD (§8.4).
 *
 * A raise here is an ESCROWED SALE, and every claim it makes is a ledger
 * balance rather than a column in this service:
 *
 *   · the supply on offer is locked out of the issuer's spendable balance
 *     before the raise may open, so "will they deliver" is a query;
 *   · each contributor's commitment escrows in THEIR OWN account, so a refund
 *     can never be funded by somebody else's stake;
 *   · settlement drains both escrows in one transaction per contributor, so
 *     there is no instant where the money has left and the tokens have not
 *     arrived;
 *   · vested allocations sit in platform escrow (§8.4) and are released against
 *     a curve anyone can recompute.
 *
 * Doctrine §0.6 is satisfied by construction: this class holds no balance, and
 * every value movement in it is `ledger.post(recipes.<something>)`.
 */

export interface RaiseRecord {
  id: string;
  issuerId: string;
  slug: string;
  name: string;
  saleAssetId: string;
  paymentAssetId: string;
  mode: RaiseMode;
  status: 'draft' | 'funding' | 'succeeded' | 'failed' | 'settled' | 'cancelled';
  saleSupply: Amount;
  price: Amount | null;
  softCap: Amount;
  hardCap: Amount;
  feeBps: number;
  opensAt: Date;
  closesAt: Date;
  vestCliffDays: number | null;
  vestDurationDays: number | null;
  outcomeAt: Date | null;
}

export interface TierRecord {
  id: string;
  raiseId: string;
  name: string;
  minStake: Amount;
  allocationCap: Amount;
}

export interface ContributionRecord {
  raiseId: string;
  userId: string;
  committed: Amount;
  commitSeq: number;
  tierName: string | null;
  status: 'committed' | 'settled' | 'refunded';
}

export interface AllocationRecord {
  raiseId: string;
  userId: string;
  contributed: Amount;
  refund: Amount;
  saleAmount: Amount;
  settledAt: Date | null;
}

export interface VestingRecord {
  id: string;
  raiseId: string | null;
  beneficiaryId: string;
  assetId: string;
  total: Amount;
  released: Amount;
  releaseSeq: number;
  cliffAt: Date;
  startAt: Date;
  endAt: Date;
}

interface RaiseRow {
  id: string;
  issuer_id: string;
  slug: string;
  name: string;
  sale_asset_id: string;
  payment_asset_id: string;
  mode: RaiseMode;
  status: RaiseRecord['status'];
  sale_supply: string;
  price: string | null;
  soft_cap: string;
  hard_cap: string;
  fee_bps: string;
  opens_at: Date;
  closes_at: Date;
  vest_cliff_days: number | null;
  vest_duration_days: number | null;
  outcome_at: Date | null;
}

interface TierRow {
  id: string;
  raise_id: string;
  name: string;
  min_stake: string;
  allocation_cap: string;
}

interface ContributionRow {
  raise_id: string;
  user_id: string;
  committed: string;
  commit_seq: number;
  tier_name: string | null;
  status: ContributionRecord['status'];
}

interface AllocationRow {
  raise_id: string;
  user_id: string;
  contributed: string;
  refund: string;
  sale_amount: string;
  settled_at: Date | null;
}

interface VestingRow {
  id: string;
  raise_id: string | null;
  beneficiary_id: string;
  asset_id: string;
  total: string;
  released: string;
  release_seq: number;
  cliff_at: Date;
  start_at: Date;
  end_at: Date;
}

function toRaise(row: RaiseRow): RaiseRecord {
  return {
    id: row.id,
    issuerId: row.issuer_id,
    slug: row.slug,
    name: row.name,
    saleAssetId: row.sale_asset_id,
    paymentAssetId: row.payment_asset_id,
    mode: row.mode,
    status: row.status,
    saleSupply: parseAmount(row.sale_supply),
    price: row.price === null ? null : parseAmount(row.price),
    softCap: parseAmount(row.soft_cap),
    hardCap: parseAmount(row.hard_cap),
    feeBps: Number(row.fee_bps),
    opensAt: row.opens_at,
    closesAt: row.closes_at,
    vestCliffDays: row.vest_cliff_days,
    vestDurationDays: row.vest_duration_days,
    outcomeAt: row.outcome_at,
  };
}

const toTier = (row: TierRow): TierRecord => ({
  id: row.id,
  raiseId: row.raise_id,
  name: row.name,
  minStake: parseAmount(row.min_stake),
  allocationCap: parseAmount(row.allocation_cap),
});

const toContribution = (row: ContributionRow): ContributionRecord => ({
  raiseId: row.raise_id,
  userId: row.user_id,
  committed: parseAmount(row.committed),
  commitSeq: row.commit_seq,
  tierName: row.tier_name,
  status: row.status,
});

const toAllocation = (row: AllocationRow): AllocationRecord => ({
  raiseId: row.raise_id,
  userId: row.user_id,
  contributed: parseAmount(row.contributed),
  refund: parseAmount(row.refund),
  saleAmount: parseAmount(row.sale_amount),
  settledAt: row.settled_at,
});

const toVesting = (row: VestingRow): VestingRecord => ({
  id: row.id,
  raiseId: row.raise_id,
  beneficiaryId: row.beneficiary_id,
  assetId: row.asset_id,
  total: parseAmount(row.total),
  released: parseAmount(row.released),
  releaseSeq: row.release_seq,
  cliffAt: row.cliff_at,
  startAt: row.start_at,
  endAt: row.end_at,
});

const vestingTerms = (v: VestingRecord): VestingTerms => ({
  total: v.total,
  startAt: v.startAt,
  cliffAt: v.cliffAt,
  endAt: v.endAt,
});

export interface LaunchServiceOptions {
  /** Smallest commitment the platform will escrow. */
  minContribution: Amount;
  /** How many contributors one settlement pass handles. */
  settleBatchSize: number;
}

export interface CreateRaiseInput {
  issuerId: string;
  slug: string;
  name: string;
  saleAssetId: string;
  paymentAssetId: string;
  mode: RaiseMode;
  saleSupply: Amount;
  price: Amount | null;
  softCap: Amount;
  hardCap: Amount;
  feeBps: number;
  opensAt: Date;
  closesAt: Date;
  vestCliffDays?: number | null;
  vestDurationDays?: number | null;
}

export class LaunchService {
  constructor(
    private readonly sql: Sql,
    private readonly ledger: LedgerClient,
    private readonly stakes: StakeSource,
    private readonly options: LaunchServiceOptions,
  ) {}

  // ── Raises ─────────────────────────────────────────────────────────────────

  /**
   * A raise starts as a `draft`: terms only, nothing escrowed, nothing visible
   * to contributors. It becomes real at `open`, which is the point where the
   * issuer's supply actually leaves their balance.
   */
  async createRaise(input: CreateRaiseInput): Promise<RaiseRecord> {
    const rows = await this.sql<RaiseRow[]>`
      INSERT INTO launch.raises (
        issuer_id, slug, name, sale_asset_id, payment_asset_id, mode,
        sale_supply, price, soft_cap, hard_cap, fee_bps, opens_at, closes_at,
        vest_cliff_days, vest_duration_days
      ) VALUES (
        ${input.issuerId}, ${input.slug}, ${input.name}, ${input.saleAssetId}, ${input.paymentAssetId}, ${input.mode},
        ${formatAmount(input.saleSupply)}::numeric,
        ${input.price === null ? null : formatAmount(input.price)}::numeric,
        ${formatAmount(input.softCap)}::numeric,
        ${formatAmount(input.hardCap)}::numeric,
        ${input.feeBps}, ${input.opensAt}, ${input.closesAt},
        ${input.vestCliffDays ?? null}, ${input.vestDurationDays ?? null}
      )
      RETURNING *
    `;
    return toRaise(rows[0]!);
  }

  async raise(raiseId: string): Promise<RaiseRecord> {
    const rows = await this.sql<RaiseRow[]>`SELECT * FROM launch.raises WHERE id = ${raiseId}`;
    const row = rows[0];
    if (!row) throw new LaunchError(`Raise ${raiseId} not found`, 'launch.raise_not_found');
    return toRaise(row);
  }

  /** Everything a contributor may browse. Drafts belong to their issuer alone. */
  async listRaises(filter: { status?: RaiseRecord['status'] } = {}): Promise<RaiseRecord[]> {
    const rows = filter.status
      ? await this.sql<RaiseRow[]>`SELECT * FROM launch.raises WHERE status = ${filter.status} ORDER BY closes_at ASC`
      : await this.sql<RaiseRow[]>`SELECT * FROM launch.raises WHERE status <> 'draft' ORDER BY closes_at ASC`;
    return rows.map(toRaise);
  }

  async addTier(input: { raiseId: string; issuerId: string; name: string; minStake: Amount; allocationCap: Amount }): Promise<TierRecord> {
    const raise = await this.raise(input.raiseId);
    this.assertIssuer(raise, input.issuerId);
    // Tiers are the gate, so they must be settled before anyone is admitted.
    // Adding one mid-raise would re-price an allocation people already committed
    // against — the same reason svc-trade snapshots rank perks at placement.
    if (raise.status !== 'draft') throw new LaunchError('Tiers can only be set while a raise is a draft', 'launch.bad_status');

    const rows = await this.sql<TierRow[]>`
      INSERT INTO launch.raise_tiers (raise_id, name, min_stake, allocation_cap)
      VALUES (${input.raiseId}, ${input.name}, ${formatAmount(input.minStake)}::numeric, ${formatAmount(input.allocationCap)}::numeric)
      RETURNING *
    `;
    return toTier(rows[0]!);
  }

  async tiers(raiseId: string): Promise<TierRecord[]> {
    const rows = await this.sql<TierRow[]>`SELECT * FROM launch.raise_tiers WHERE raise_id = ${raiseId} ORDER BY min_stake ASC`;
    return rows.map(toTier);
  }

  /**
   * Open the raise — the first money movement, and the one that makes every
   * later promise checkable.
   *
   * The supply is escrowed BEFORE contributors can commit, so a raise can never
   * be selling tokens the issuer has since spent. The ledger refuses the lock
   * outright if they do not hold them, which is the whole point of doing it at
   * this end of the flow.
   */
  async open(input: { raiseId: string; issuerId: string }): Promise<RaiseRecord> {
    const raise = await this.raise(input.raiseId);
    this.assertIssuer(raise, input.issuerId);
    if (raise.status !== 'draft') throw new LaunchError(`A ${raise.status} raise cannot be opened`, 'launch.bad_status');

    const tiers = await this.tiers(raise.id);
    if (tiers.length === 0) {
      // Without a tier nothing can be admitted, so an "open" raise with none is
      // a raise that silently accepts nobody. Refuse loudly instead.
      throw new LaunchError('A raise needs at least one allocation tier before it opens', 'launch.no_tiers');
    }

    return withMoneySpan(
      'launch.open',
      { operation: 'supply-lock', raiseId: raise.id, issuerId: raise.issuerId, amount: formatAmount(raise.saleSupply), assetId: raise.saleAssetId },
      async () => {
        await this.ledger.post(
          recipes.raiseSupplyLock({
            raiseId: raise.id,
            issuerId: raise.issuerId,
            saleAssetId: raise.saleAssetId,
            amount: raise.saleSupply,
          }),
        );

        const rows = await this.sql<RaiseRow[]>`
          UPDATE launch.raises SET status = 'funding', updated_at = now()
           WHERE id = ${raise.id} AND status = 'draft'
          RETURNING *
        `;
        // The post is idempotent, so a retry after a crash between the two finds
        // the row already moved on and returns the current truth rather than
        // pretending the lock did not happen.
        return rows[0] ? toRaise(rows[0]) : await this.raise(raise.id);
      },
    );
  }

  /** A draft that will never run. Nothing is escrowed at this point, so nothing moves. */
  async cancel(input: { raiseId: string; issuerId: string }): Promise<RaiseRecord> {
    const raise = await this.raise(input.raiseId);
    this.assertIssuer(raise, input.issuerId);
    if (raise.status !== 'draft') {
      // Once contributors can commit, the window is a promise. An open raise
      // ends by closing — succeeding or failing against its soft cap — never by
      // the issuer changing their mind while holding other people's money.
      throw new LaunchError('Only a draft raise can be cancelled; an open raise must close', 'launch.bad_status');
    }
    const rows = await this.sql<RaiseRow[]>`
      UPDATE launch.raises SET status = 'cancelled', updated_at = now() WHERE id = ${raise.id} AND status = 'draft' RETURNING *
    `;
    return rows[0] ? toRaise(rows[0]) : await this.raise(raise.id);
  }

  // ── Contributing ───────────────────────────────────────────────────────────

  /** Total committed to a raise so far. Derived from the rows, never a column. */
  async raised(raiseId: string, tx: Sql = this.sql): Promise<Amount> {
    const rows = await tx<Array<{ total: string }>>`
      SELECT COALESCE(SUM(committed), 0) AS total FROM launch.contributions WHERE raise_id = ${raiseId}
    `;
    return parseAmount(rows[0]?.total ?? '0');
  }

  async contribution(raiseId: string, userId: string): Promise<ContributionRecord | null> {
    const rows = await this.sql<ContributionRow[]>`
      SELECT * FROM launch.contributions WHERE raise_id = ${raiseId} AND user_id = ${userId}
    `;
    return rows[0] ? toContribution(rows[0]) : null;
  }

  /**
   * Commit to a raise.
   *
   * ── Ordering: claim the sequence, then post, then compensate on failure ────
   *
   * The row claim runs in its own transaction that takes an exclusive lock on
   * the raise, and that lock is what makes the hard-cap check mean anything —
   * two contributors racing for the last slot queue on it instead of both
   * reading the same headroom and both being admitted. The ledger post happens
   * AFTER that transaction commits, so a network call never holds a row lock on
   * the busiest row in the service.
   *
   * If the post is refused (the contributor does not have the funds), the claim
   * is rolled back. The sequence number it consumed is deliberately NOT reused:
   * a fresh attempt gets a fresh key, so a post that was actually accepted but
   * whose response we lost can never be confused with the retry.
   */
  async contribute(input: { raiseId: string; userId: string; amount: Amount; now?: Date }): Promise<ContributionRecord> {
    const now = input.now ?? new Date();

    if (input.amount < this.options.minContribution) {
      throw new LaunchError(
        `The minimum commitment is ${formatAmount(this.options.minContribution)}`,
        'launch.below_minimum',
      );
    }

    const raise = await this.raise(input.raiseId);
    if (raise.status !== 'funding') throw new LaunchError(`This raise is ${raise.status}`, 'launch.bad_status');
    if (now < raise.opensAt || now >= raise.closesAt) {
      throw new LaunchError('The funding window is not open', 'launch.window_closed');
    }

    // The stake gate. Read live, never cached: a tier that keeps admitting
    // someone after they unstake is not a gate. Fails closed — see stake-source.ts.
    const tiers = await this.tiers(raise.id);
    const stake = await this.stakes.stakeOf(input.userId);
    const tier = tierFor(tiers, stake);
    if (!tier) {
      throw new LaunchError('Your stake does not meet any allocation tier for this raise', 'launch.tier_not_met');
    }

    const claimed = await transaction(
      this.sql,
      async (tx) => {
        // Exclusive lock on the raise establishes the total order the hard-cap
        // check depends on. `read committed` is correct precisely because of it.
        await tx`SELECT id FROM launch.raises WHERE id = ${raise.id} FOR UPDATE`;

        const raisedSoFar = await this.raised(raise.id, tx);
        const existing = await tx<ContributionRow[]>`
          SELECT * FROM launch.contributions WHERE raise_id = ${raise.id} AND user_id = ${input.userId} FOR UPDATE
        `;
        const alreadyCommitted = existing[0] ? parseAmount(existing[0].committed) : 0n;

        const headroom = commitHeadroom({
          raised: raisedSoFar,
          hardCap: raise.hardCap,
          alreadyCommitted,
          tierCap: tier.allocationCap,
        });

        if (headroom <= 0n) {
          throw raisedSoFar >= raise.hardCap
            ? new LaunchError('This raise has reached its hard cap', 'launch.hard_cap_reached')
            : new LaunchError(`Tier "${tier.name}" allows at most ${formatAmount(tier.allocationCap)}`, 'launch.allocation_cap_reached');
        }
        if (input.amount > headroom) {
          // Refused rather than partially filled. A silent trim would take a
          // different amount than the caller asked for, and the caller would
          // find out from their balance.
          throw raisedSoFar + input.amount > raise.hardCap
            ? new LaunchError(`Only ${formatAmount(headroom)} remains in this raise`, 'launch.hard_cap_reached')
            : new LaunchError(`Only ${formatAmount(headroom)} remains in your tier allocation`, 'launch.allocation_cap_reached');
        }

        const rows = await tx<ContributionRow[]>`
          INSERT INTO launch.contributions (raise_id, user_id, committed, commit_seq, tier_name)
          VALUES (${raise.id}, ${input.userId}, ${formatAmount(input.amount)}::numeric, 0, ${tier.name})
          ON CONFLICT (raise_id, user_id) DO UPDATE
            SET committed  = launch.contributions.committed + EXCLUDED.committed,
                commit_seq = launch.contributions.commit_seq + 1,
                updated_at = now()
          RETURNING *
        `;
        return toContribution(rows[0]!);
      },
      { isolation: 'read committed' },
    );

    return withMoneySpan(
      'launch.contribute',
      {
        operation: 'contribute',
        raiseId: raise.id,
        userId: input.userId,
        amount: formatAmount(input.amount),
        assetId: raise.paymentAssetId,
        sequence: claimed.commitSeq,
      },
      async () => {
        try {
          await this.ledger.post(
            recipes.raiseContribute({
              raiseId: raise.id,
              userId: input.userId,
              paymentAssetId: raise.paymentAssetId,
              amount: input.amount,
              sequence: claimed.commitSeq,
            }),
          );
        } catch (err) {
          // Un-claim the amount. `commit_seq` stays consumed on purpose.
          await this.sql`
            UPDATE launch.contributions
               SET committed = GREATEST(committed - ${formatAmount(input.amount)}::numeric, 0), updated_at = now()
             WHERE raise_id = ${raise.id} AND user_id = ${input.userId}
          `;
          throw err;
        }
        return claimed;
      },
    );
  }

  // ── Closing ────────────────────────────────────────────────────────────────

  /**
   * Decide the outcome, once.
   *
   * The allocation is computed from the closed book of contributions and
   * WRITTEN BEFORE any money moves — the same ordering svc-p2p uses for dispute
   * resolutions, and for the same reason: the trail should explain the movement
   * rather than be reconstructed from it. A settlement that crashes and resumes
   * re-reads these rows instead of re-deciding against a book that may have
   * changed underneath it.
   *
   * Idempotent: a raise that already has an outcome returns it unchanged.
   */
  async close(input: { raiseId: string; now?: Date }): Promise<{ raise: RaiseRecord; lines: AllocationRecord[] }> {
    const now = input.now ?? new Date();
    const raise = await this.raise(input.raiseId);

    if (raise.status === 'succeeded' || raise.status === 'failed' || raise.status === 'settled') {
      return { raise, lines: await this.allocations(raise.id) };
    }
    if (raise.status !== 'funding') throw new LaunchError(`A ${raise.status} raise cannot close`, 'launch.bad_status');

    const raisedSoFar = await this.raised(raise.id);
    // Early close is allowed only when the raise is full: there is nothing left
    // to sell, so making contributors wait out the clock buys nobody anything.
    if (now < raise.closesAt && raisedSoFar < raise.hardCap) {
      throw new LaunchError('The funding window has not closed yet', 'launch.window_not_closed');
    }

    const rows = await this.sql<ContributionRow[]>`
      SELECT * FROM launch.contributions
       WHERE raise_id = ${raise.id} AND committed > 0
       ORDER BY created_at ASC, user_id ASC
    `;
    const contributions = rows.map(toContribution);

    const result = allocate(
      { mode: raise.mode, saleSupply: raise.saleSupply, price: raise.price, softCap: raise.softCap },
      contributions.map((c) => ({ userId: c.userId, amount: c.committed })),
    );

    await transaction(this.sql, async (tx) => {
      for (const line of result.lines) {
        await tx`
          INSERT INTO launch.allocations (raise_id, user_id, contributed, refund, sale_amount)
          VALUES (${raise.id}, ${line.userId}, ${formatAmount(line.contributed)}::numeric,
                  ${formatAmount(line.refund)}::numeric, ${formatAmount(line.saleAmount)}::numeric)
          ON CONFLICT (raise_id, user_id) DO NOTHING
        `;
      }
      await tx`
        UPDATE launch.raises
           SET status = ${result.outcome}, outcome_at = ${now}, updated_at = now()
         WHERE id = ${raise.id} AND status = 'funding'
      `;
    });

    return { raise: await this.raise(raise.id), lines: await this.allocations(raise.id) };
  }

  async allocations(raiseId: string): Promise<AllocationRecord[]> {
    const rows = await this.sql<AllocationRow[]>`
      SELECT * FROM launch.allocations WHERE raise_id = ${raiseId} ORDER BY created_at ASC, user_id ASC
    `;
    return rows.map(toAllocation);
  }

  // ── Settling ───────────────────────────────────────────────────────────────

  /**
   * Pay out (or refund) up to `settleBatchSize` contributors, then return.
   *
   * Resumable by design. Each contributor is one atomic ledger transaction with
   * a key derived from (raise, contributor), so a pass that dies halfway
   * through re-posts what it already did as a no-op and continues. Nothing here
   * depends on the pass completing, which is what lets an operator stop a bad
   * one after the first few rather than after all nine hundred.
   *
   * When the last contributor is done, unsold supply goes back to the issuer and
   * the raise reaches `settled`.
   */
  async settle(input: { raiseId: string; limit?: number; now?: Date }): Promise<{ settled: number; remaining: number; finished: boolean }> {
    const now = input.now ?? new Date();
    const raise = await this.raise(input.raiseId);

    if (raise.status === 'settled') return { settled: 0, remaining: 0, finished: true };
    if (raise.status !== 'succeeded' && raise.status !== 'failed') {
      throw new LaunchError(`A ${raise.status} raise has nothing to settle`, 'launch.bad_status');
    }

    const limit = Math.min(input.limit ?? this.options.settleBatchSize, this.options.settleBatchSize);
    const pending = await this.sql<AllocationRow[]>`
      SELECT * FROM launch.allocations
       WHERE raise_id = ${raise.id} AND settled_at IS NULL
       ORDER BY created_at ASC, user_id ASC
       LIMIT ${limit}
    `;

    let settled = 0;
    for (const row of pending.map(toAllocation)) {
      await this.settleOne(raise, row, now);
      settled++;
    }

    const countRows = await this.sql<Array<{ count: string }>>`
      SELECT COUNT(*)::text AS count FROM launch.allocations WHERE raise_id = ${raise.id} AND settled_at IS NULL
    `;
    // `COUNT(*)` always returns a row. Reading it as if it must, though, means a
    // driver that ever returned none would give `remaining = NaN`, which is not
    // `0`, so the raise would neither close nor say why. Failing loudly here
    // keeps "settlement finished" a fact the books can be closed on.
    const countRow = countRows[0];
    if (!countRow) throw new LaunchError('Could not count outstanding allocations', 'launch.settle_count_failed');
    const remaining = Number(countRow.count);

    if (remaining === 0) {
      await this.returnUnsoldSupply(raise);
      await this.sql`
        UPDATE launch.raises SET status = 'settled', updated_at = now()
         WHERE id = ${raise.id} AND status IN ('succeeded', 'failed')
      `;
    }

    return { settled, remaining, finished: remaining === 0 };
  }

  /**
   * One contributor.
   *
   * Post FIRST, then record. That order is deliberate and it is the safe one: a
   * crash between the two leaves a movement that has happened and a row that
   * has not caught up, which the next pass repairs by re-posting (a no-op
   * against the same key) and marking. The other order would leave a row
   * claiming a payment that never posted, and nothing would ever go back for it.
   */
  private async settleOne(raise: RaiseRecord, line: AllocationRecord, now: Date): Promise<void> {
    const refundOnly = line.saleAmount <= 0n;

    await withMoneySpan(
      refundOnly ? 'launch.settle.refund' : 'launch.settle.allocate',
      {
        operation: refundOnly ? 'refund' : 'settle',
        raiseId: raise.id,
        userId: line.userId,
        amount: formatAmount(line.contributed),
        assetId: raise.paymentAssetId,
      },
      async () => {
        if (refundOnly) {
          await this.ledger.post(
            recipes.raiseRefund({
              raiseId: raise.id,
              userId: line.userId,
              paymentAssetId: raise.paymentAssetId,
              amount: line.contributed,
            }),
          );
        } else {
          // The schedule row is created before the post because its id is part
          // of the ledger account the tokens land in. `ON CONFLICT DO NOTHING`
          // plus a re-read makes a resumed settlement reuse the same schedule
          // rather than stranding the first one's escrow.
          const scheduleId = await this.ensureVestingSchedule(raise, line, now);

          await this.ledger.post(
            recipes.raiseSettleContributor({
              raiseId: raise.id,
              issuerId: raise.issuerId,
              userId: line.userId,
              paymentAssetId: raise.paymentAssetId,
              contributed: line.contributed,
              refund: line.refund,
              feeBps: raise.feeBps,
              saleAssetId: raise.saleAssetId,
              saleAmount: line.saleAmount,
              ...(scheduleId ? { vestingScheduleId: scheduleId } : {}),
            }),
          );
        }

        await transaction(this.sql, async (tx) => {
          await tx`
            UPDATE launch.allocations SET settled_at = ${now}
             WHERE raise_id = ${raise.id} AND user_id = ${line.userId} AND settled_at IS NULL
          `;
          await tx`
            UPDATE launch.contributions SET status = ${refundOnly ? 'refunded' : 'settled'}, updated_at = now()
             WHERE raise_id = ${raise.id} AND user_id = ${line.userId}
          `;
        });
      },
    );
  }

  /** Null when the raise delivers immediately — most do. */
  private async ensureVestingSchedule(raise: RaiseRecord, line: AllocationRecord, now: Date): Promise<string | null> {
    if (raise.vestCliffDays === null || raise.vestDurationDays === null) return null;

    const window = scheduleWindow({ settledAt: now, cliffDays: raise.vestCliffDays, durationDays: raise.vestDurationDays });

    await this.sql`
      INSERT INTO launch.vesting_schedules (raise_id, beneficiary_id, asset_id, total, cliff_at, start_at, end_at)
      VALUES (${raise.id}, ${line.userId}, ${raise.saleAssetId}, ${formatAmount(line.saleAmount)}::numeric,
              ${window.cliffAt}, ${window.startAt}, ${window.endAt})
      ON CONFLICT (raise_id, beneficiary_id) DO NOTHING
    `;

    const rows = await this.sql<Array<{ id: string }>>`
      SELECT id FROM launch.vesting_schedules WHERE raise_id = ${raise.id} AND beneficiary_id = ${line.userId}
    `;
    const id = rows[0]?.id;
    if (!id) throw new LaunchError('Vesting schedule could not be created', 'launch.schedule_not_found');
    return id;
  }

  /**
   * Whatever the raise did not sell goes home.
   *
   * The amount is read from the LEDGER, not computed from the allocation rows:
   * the escrow balance is the authority on what is left, and asking it means a
   * rounding disagreement between this service and the book surfaces as a
   * refused post rather than as supply quietly stranded in escrow forever.
   */
  private async returnUnsoldSupply(raise: RaiseRecord): Promise<void> {
    const escrow = await this.ledger.balance(raiseSupplyAccount(raise.issuerId, raise.saleAssetId, raise.id));
    if (escrow.amount <= 0n) return;

    await withMoneySpan(
      'launch.supply.return',
      {
        operation: 'supply-return',
        raiseId: raise.id,
        issuerId: raise.issuerId,
        amount: formatAmount(escrow.amount),
        assetId: raise.saleAssetId,
        outcome: raise.status,
      },
      async () => {
        await this.ledger.post(
          recipes.raiseSupplyReturn({
            raiseId: raise.id,
            issuerId: raise.issuerId,
            saleAssetId: raise.saleAssetId,
            amount: escrow.amount,
            reason: raise.status === 'failed' ? 'failed' : 'unsold',
          }),
        );
      },
    );
  }

  /** What is still escrowed for a contributor. A ledger read, never a column. */
  async escrowed(raiseId: string, userId: string): Promise<Amount> {
    const raise = await this.raise(raiseId);
    return (await this.ledger.balance(raiseContributionAccount(userId, raise.paymentAssetId, raiseId))).amount;
  }

  // ── Vesting ────────────────────────────────────────────────────────────────

  async schedules(beneficiaryId: string): Promise<VestingRecord[]> {
    const rows = await this.sql<VestingRow[]>`
      SELECT * FROM launch.vesting_schedules WHERE beneficiary_id = ${beneficiaryId} ORDER BY end_at ASC
    `;
    return rows.map(toVesting);
  }

  async schedule(scheduleId: string): Promise<VestingRecord> {
    const rows = await this.sql<VestingRow[]>`SELECT * FROM launch.vesting_schedules WHERE id = ${scheduleId}`;
    const row = rows[0];
    if (!row) throw new LaunchError(`Vesting schedule ${scheduleId} not found`, 'launch.schedule_not_found');
    return toVesting(row);
  }

  /** What a schedule would pay right now. The same function the claim uses. */
  async claimableNow(scheduleId: string, now: Date = new Date()): Promise<Amount> {
    const schedule = await this.schedule(scheduleId);
    return claimable(vestingTerms(schedule), schedule.released, now);
  }

  /**
   * Claim what has vested.
   *
   * ── Why the watermark moves first here, and not last ───────────────────────
   *
   * Unlike settlement, the amount is not decided in advance — it depends on the
   * instant you ask. Two claims a millisecond apart would compute two different
   * amounts, and if both posted first they would post two different transactions
   * under two keys and pay twice.
   *
   * So the watermark is advanced under a row lock BEFORE the post, which is what
   * fixes the amount and the key together. A crash between the two leaves a
   * schedule that believes it has released more than it has; the compensating
   * update below rolls it back on a refused post, and a post that succeeded but
   * whose response was lost is recovered by the ledger returning the original
   * transaction for the same key on the next attempt.
   */
  async claim(input: { scheduleId: string; beneficiaryId: string; now?: Date }): Promise<{ released: Amount; ledgerTxId: string }> {
    const now = input.now ?? new Date();

    const claimed = await transaction(
      this.sql,
      async (tx) => {
        const rows = await tx<VestingRow[]>`SELECT * FROM launch.vesting_schedules WHERE id = ${input.scheduleId} FOR UPDATE`;
        const row = rows[0];
        if (!row) throw new LaunchError(`Vesting schedule ${input.scheduleId} not found`, 'launch.schedule_not_found');

        const schedule = toVesting(row);
        // Ownership is checked inside the lock, not before it: a schedule is
        // claimable only by the person it vests to, and reading it out here
        // would leave a window where a concurrent transfer changed the answer.
        if (schedule.beneficiaryId !== input.beneficiaryId) {
          throw new LaunchError('This vesting schedule belongs to someone else', 'launch.schedule_not_found');
        }

        const owed = claimable(vestingTerms(schedule), schedule.released, now);
        if (owed <= 0n) throw new LaunchError('Nothing has vested yet', 'launch.nothing_claimable');

        await tx`
          UPDATE launch.vesting_schedules
             SET released = released + ${formatAmount(owed)}::numeric, release_seq = release_seq + 1, updated_at = now()
           WHERE id = ${schedule.id}
        `;

        return { schedule, owed, sequence: schedule.releaseSeq };
      },
      { isolation: 'read committed' },
    );

    return withMoneySpan(
      'launch.vesting.claim',
      {
        operation: 'vesting-release',
        scheduleId: claimed.schedule.id,
        userId: input.beneficiaryId,
        amount: formatAmount(claimed.owed),
        assetId: claimed.schedule.assetId,
        sequence: claimed.sequence,
      },
      async () => {
        try {
          const tx = await this.ledger.post(
            recipes.vestingRelease({
              scheduleId: claimed.schedule.id,
              beneficiaryId: input.beneficiaryId,
              assetId: claimed.schedule.assetId,
              amount: claimed.owed,
              sequence: claimed.sequence,
            }),
          );
          return { released: claimed.owed, ledgerTxId: tx.id };
        } catch (err) {
          // Put the watermark back. `release_seq` stays consumed, so a retry
          // gets a fresh key and cannot be confused with this attempt.
          await this.sql`
            UPDATE launch.vesting_schedules
               SET released = GREATEST(released - ${formatAmount(claimed.owed)}::numeric, 0), updated_at = now()
             WHERE id = ${claimed.schedule.id}
          `;
          throw err;
        }
      },
    );
  }

  /** What is actually sitting in a schedule's escrow. A ledger read. */
  async vestingEscrowBalance(scheduleId: string): Promise<Amount> {
    const schedule = await this.schedule(scheduleId);
    return (await this.ledger.balance(vestingEscrow(schedule.id, schedule.assetId))).amount;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private assertIssuer(raise: RaiseRecord, issuerId: string): void {
    if (raise.issuerId !== issuerId) throw new LaunchError('You do not own this raise', 'launch.not_issuer');
  }
}

/** Exported for tests and the router's summary view — the raise's own arithmetic. */
export function totalAllocated(lines: readonly AllocationLine[]): Amount {
  return sum(lines.map((l) => l.saleAmount));
}

/** What a raise still has to sell, from its own decided allocation. */
export function unsoldFrom(saleSupply: Amount, lines: readonly AllocationLine[]): Amount {
  return sub(saleSupply, totalAllocated(lines));
}
