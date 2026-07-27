import type { Sql } from 'postgres';
import { transaction } from '@intafaced/db';
import {
  InsufficientFundsError,
  LedgerError,
  formatAmount,
  parseAmount,
  recipes,
  type Amount,
  type LedgerClient,
} from '@intafaced/ledger-client';
import { BankError } from '../errors.js';
import { accountForSpace, type SpaceService } from '../spaces/space-service.js';
import { MAX_CATCH_UP_PER_PASS, planDue, occurrenceStart, type Cadence } from './schedule.js';
import { withMoneySpan } from '../tracing.js';

/**
 * TRANSFERS — the rails half of §8.1.
 *
 * Two paths: a one-off transfer a user asks for, and a standing order a
 * scheduler drives. The second is the dangerous one. A scheduler WILL fire
 * twice — a retry, a second replica, a clock stepping backwards over a DST
 * boundary, an operator re-running a job after an outage — so "exactly once"
 * cannot rest on the timer being well behaved.
 *
 * It rests on two independent things instead:
 *
 *   1. `unique(schedule_id, occurrence)` on `bank.transfer_executions`. The job
 *      CLAIMS the occurrence by inserting before it posts. A second run's insert
 *      conflicts and it does nothing.
 *   2. The ledger's idempotency key `bank.transfer:<scheduleId>:<occurrence>`.
 *      Even with the claim bypassed, the second post returns the first one's
 *      transaction rather than moving value again.
 *
 * They agree by construction: both are derived from the same (schedule,
 * occurrence) pair, and `occurrence` is computed from the schedule's anchor and
 * cadence — never from a counter, never from a clock reading.
 */

export interface TransferResult {
  transferId: string;
  occurrence: number;
  ledgerTxId: string;
  amount: string;
}

export interface ScheduleRecord {
  id: string;
  userId: string;
  assetId: string;
  fromSpaceId: string;
  toSpaceId: string;
  amount: Amount;
  cadence: Cadence;
  startsAt: Date;
  endsAt: Date | null;
  nextRunAt: Date;
  status: 'active' | 'paused' | 'cancelled' | 'completed';
}

interface ScheduleRow {
  id: string;
  user_id: string;
  asset_id: string;
  from_space_id: string;
  to_space_id: string;
  amount: string;
  cadence: Cadence;
  starts_at: Date;
  ends_at: Date | null;
  next_run_at: Date;
  status: ScheduleRecord['status'];
}

function toSchedule(row: ScheduleRow): ScheduleRecord {
  return {
    id: row.id,
    userId: row.user_id,
    assetId: row.asset_id,
    fromSpaceId: row.from_space_id,
    toSpaceId: row.to_space_id,
    amount: parseAmount(row.amount),
    cadence: row.cadence,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    nextRunAt: row.next_run_at,
    status: row.status,
  };
}

export type FiringOutcome = 'settled' | 'rejected' | 'already-fired';

export interface RunReport {
  schedulesConsidered: number;
  settled: number;
  rejected: number;
  alreadyFired: number;
}

export class TransferService {
  constructor(
    private readonly sql: Sql,
    private readonly ledger: LedgerClient,
    private readonly spaces: SpaceService,
  ) {}

  // ── One-off transfer ───────────────────────────────────────────────────────

  /**
   * Move value between two spaces, now.
   *
   * `transferId` is supplied by the caller (a client-generated request id) so a
   * retried HTTP request is the same transfer, not a second one. Occurrence is
   * 0: a one-off transfer is a schedule that fires once.
   *
   * If this crashes exactly here — after the ledger post, before returning —
   * nobody's funds are stranded. The movement is committed in the book and the
   * caller's retry with the same `transferId` returns the original transaction.
   * There is no local row for this path precisely so there is nothing to
   * disagree with the ledger about.
   */
  async transfer(input: {
    transferId: string;
    fromSpaceId: string;
    toSpaceId: string;
    amount: Amount;
    now?: Date;
  }): Promise<TransferResult> {
    const now = input.now ?? new Date();

    return withMoneySpan(
      'bank.transfer',
      { operation: 'transfer', amount: formatAmount(input.amount), spaceId: input.fromSpaceId },
      async () => {
        if (input.fromSpaceId === input.toSpaceId) {
          throw new BankError('A transfer needs two different spaces', 'bank.same_space');
        }

        const from = await this.spaces.resolveForDebit(input.fromSpaceId, now);
        const to = await this.spaces.resolveForCredit(input.toSpaceId);

        if (from.assetId !== to.assetId) {
          // Converting between assets is a trade, and a trade has an execution
          // price this service has no business inventing (§4.2: svc-trade prices).
          throw new BankError(`Cannot transfer ${from.assetId} into a ${to.assetId} space — convert first`, 'bank.asset_mismatch');
        }

        const tx = await this.ledger.post(
          recipes.bankTransfer({
            transferId: input.transferId,
            occurrence: 0,
            from: accountForSpace(from),
            to: accountForSpace(to),
            amount: input.amount,
            kind: 'manual',
          }),
        );

        return { transferId: input.transferId, occurrence: 0, ledgerTxId: tx.id, amount: formatAmount(input.amount) };
      },
    );
  }

  // ── Standing orders ────────────────────────────────────────────────────────

  async schedule(input: {
    userId: string;
    fromSpaceId: string;
    toSpaceId: string;
    amount: Amount;
    cadence: Cadence;
    startsAt: Date;
    endsAt?: Date | null;
  }): Promise<ScheduleRecord> {
    if (input.fromSpaceId === input.toSpaceId) {
      throw new BankError('A standing order needs two different spaces', 'bank.same_space');
    }

    const from = await this.spaces.get(input.fromSpaceId);
    const to = await this.spaces.get(input.toSpaceId);
    if (from.assetId !== to.assetId) {
      throw new BankError(`Cannot schedule ${from.assetId} into a ${to.assetId} space`, 'bank.asset_mismatch');
    }

    const rows = await this.sql<ScheduleRow[]>`
      INSERT INTO bank.scheduled_transfers
        (user_id, asset_id, from_space_id, to_space_id, amount, cadence, starts_at, ends_at, next_run_at)
      VALUES (
        ${input.userId}, ${from.assetId}, ${input.fromSpaceId}, ${input.toSpaceId},
        ${formatAmount(input.amount)}::numeric, ${input.cadence}, ${input.startsAt},
        ${input.endsAt ?? null}, ${input.startsAt}
      )
      RETURNING id, user_id, asset_id, from_space_id, to_space_id, amount, cadence,
                starts_at, ends_at, next_run_at, status
    `;
    return toSchedule(rows[0]!);
  }

  async listSchedules(userId: string): Promise<ScheduleRecord[]> {
    const rows = await this.sql<ScheduleRow[]>`
      SELECT id, user_id, asset_id, from_space_id, to_space_id, amount, cadence,
             starts_at, ends_at, next_run_at, status
        FROM bank.scheduled_transfers WHERE user_id = ${userId} ORDER BY created_at DESC
    `;
    return rows.map(toSchedule);
  }

  /**
   * Cancel a standing order.
   *
   * Cancelling never touches occurrences that have already fired: those are
   * completed movements in the ledger, and "cancel" is not "reverse". A reversal
   * would need its own recipe, its own authorisation, and the counterparty's
   * consent — none of which a cancel button implies.
   */
  async cancelSchedule(scheduleId: string): Promise<void> {
    const updated = await this.sql`
      UPDATE bank.scheduled_transfers SET status = 'cancelled', updated_at = now()
       WHERE id = ${scheduleId} AND status IN ('active', 'paused')
       RETURNING id
    `;
    if (updated.length === 0) throw new BankError(`Schedule ${scheduleId} is not cancellable`, 'bank.schedule_inactive');
  }

  // ── The runner ─────────────────────────────────────────────────────────────

  /**
   * Fire every standing order that is due.
   *
   * Safe to run twice, concurrently, or after an outage. The claim row and the
   * ledger key both key on (schedule, occurrence), so the second run finds every
   * occurrence already taken and does nothing.
   */
  async runDueTransfers(options: { now?: Date; limit?: number; maxCatchUp?: number } = {}): Promise<RunReport> {
    const now = options.now ?? new Date();
    const limit = options.limit ?? 200;

    const due = await this.sql<ScheduleRow[]>`
      SELECT id, user_id, asset_id, from_space_id, to_space_id, amount, cadence,
             starts_at, ends_at, next_run_at, status
        FROM bank.scheduled_transfers
       WHERE status = 'active' AND next_run_at <= ${now}
       ORDER BY next_run_at ASC
       LIMIT ${limit}
    `;

    const report: RunReport = { schedulesConsidered: due.length, settled: 0, rejected: 0, alreadyFired: 0 };

    for (const row of due) {
      const outcomes = await this.driveSchedule(toSchedule(row), now, options.maxCatchUp ?? MAX_CATCH_UP_PER_PASS);
      for (const outcome of outcomes) {
        if (outcome === 'settled') report.settled++;
        else if (outcome === 'rejected') report.rejected++;
        else report.alreadyFired++;
      }
    }

    return report;
  }

  private async driveSchedule(schedule: ScheduleRecord, now: Date, maxCatchUp: number): Promise<FiringOutcome[]> {
    // What has ALREADY happened, from the record of firings — never from a
    // counter on the schedule row. A counter that a retry double-increments
    // skips a user's transfer silently; this cannot.
    const fired = await this.sql<Array<{ last: number | null }>>`
      SELECT MAX(occurrence) AS last FROM bank.transfer_executions WHERE schedule_id = ${schedule.id}
    `;

    /**
     * Occurrences that were CLAIMED but never finished.
     *
     * A committed `pending` row is a claim whose process died. It cannot happen
     * in the current ordering — the claim and the ledger post share a
     * transaction — but a claim nobody will ever finish is the one failure that
     * strands a user's transfer forever with no error anywhere, so it is swept
     * explicitly rather than assumed away. Re-driving is safe because the ledger
     * post is idempotent on (schedule, occurrence).
     */
    const stranded = await this.sql<Array<{ occurrence: number }>>`
      SELECT occurrence FROM bank.transfer_executions
       WHERE schedule_id = ${schedule.id} AND status = 'pending'
       ORDER BY occurrence ASC
    `;

    const plan = planDue({
      startsAt: schedule.startsAt,
      cadence: schedule.cadence,
      endsAt: schedule.endsAt,
      lastFired: fired[0]?.last ?? null,
      now,
      maxCatchUp,
    });

    const outcomes: FiringOutcome[] = [];
    for (const row of stranded) {
      outcomes.push(await this.fireOccurrence(schedule, row.occurrence));
    }
    for (const occurrence of plan.occurrences) {
      outcomes.push(await this.fireOccurrence(schedule, occurrence));
    }

    // Advance the scheduling hint LAST. If this update is lost, the next pass
    // reconsiders occurrences that the executions table already owns and skips
    // them — wasted work, never a double transfer. The other order would let a
    // crash advance past an occurrence that never fired.
    await this.sql`
      UPDATE bank.scheduled_transfers
         SET next_run_at = ${plan.nextRunAt},
             status = ${plan.completed ? 'completed' : schedule.status},
             updated_at = now()
       WHERE id = ${schedule.id} AND status = 'active'
    `;

    return outcomes;
  }

  /**
   * One firing of one standing order.
   *
   * Ordering, and what a crash at each point costs:
   *
   *   claim row → ledger post → mark settled, all in one database transaction.
   *
   *   · crash before the claim commits  — nothing happened; next pass retries.
   *   · crash after the ledger post, before the commit — the database rolls the
   *     claim back while the ledger transaction stands. The next pass re-claims
   *     and re-posts; the post is idempotent on
   *     `bank.transfer:<schedule>:<occurrence>` so it returns the SAME
   *     transaction and the row is written against it. Money moved once, the
   *     record catches up. Nobody's funds are stranded — the value is in the
   *     destination account the whole time, and the only thing that was ever
   *     missing was our note about it.
   *   · crash after the commit — done.
   *
   * Holding a database transaction open across the ledger call is a deliberate
   * cost: it is what makes "claimed" and "posted" inseparable. The alternative,
   * committing the claim first, creates a window where a claimed occurrence has
   * no ledger transaction and no process left alive to make one — a transfer the
   * user was told would happen, that never will.
   */
  private async fireOccurrence(schedule: ScheduleRecord, occurrence: number): Promise<FiringOutcome> {
    return withMoneySpan(
      'bank.transfer.scheduled',
      {
        operation: 'scheduled-transfer',
        scheduleId: schedule.id,
        occurrence,
        amount: formatAmount(schedule.amount),
        assetId: schedule.assetId,
      },
      async (span) => {
        const outcome = await this.fireOccurrenceInner(schedule, occurrence);
        span.setAttribute('intafaced.outcome', outcome);
        return outcome;
      },
    );
  }

  private async fireOccurrenceInner(schedule: ScheduleRecord, occurrence: number): Promise<FiringOutcome> {
    const from = await this.spaces.get(schedule.fromSpaceId);
    const to = await this.spaces.get(schedule.toSpaceId);

    return transaction(
      this.sql,
      async (tx) => {
        const claimed = await tx<Array<{ id: string }>>`
          INSERT INTO bank.transfer_executions (schedule_id, occurrence, amount, status)
          VALUES (${schedule.id}, ${occurrence}, ${formatAmount(schedule.amount)}::numeric, 'pending')
          ON CONFLICT (schedule_id, occurrence) DO NOTHING
          RETURNING id
        `;

        if (claimed.length === 0) {
          // Another pass owns this occurrence. Almost always it is finished; a
          // row still `pending` means a process died in a way that committed the
          // claim without the post, so re-drive it — the ledger post is
          // idempotent, which makes re-driving strictly safe.
          const existing = await tx<Array<{ id: string; status: string }>>`
            SELECT id, status FROM bank.transfer_executions
             WHERE schedule_id = ${schedule.id} AND occurrence = ${occurrence} FOR UPDATE
          `;
          const row = existing[0];
          if (!row || row.status !== 'pending') return 'already-fired' as const;
          return this.settle(tx, row.id, schedule, from, to, occurrence);
        }

        return this.settle(tx, claimed[0]!.id, schedule, from, to, occurrence);
      },
      // `read committed` is correct here because the ordering between competing
      // runs is already established by the unique index on (schedule,
      // occurrence): the loser blocks on the insert rather than racing ahead and
      // aborting. Serializable would add retries without adding safety.
      { isolation: 'read committed', maxAttempts: 5 },
    );
  }

  private async settle(
    tx: Sql,
    executionId: string,
    schedule: ScheduleRecord,
    from: Awaited<ReturnType<SpaceService['get']>>,
    to: Awaited<ReturnType<SpaceService['get']>>,
    occurrence: number,
  ): Promise<FiringOutcome> {
    try {
      const posted = await this.ledger.post(
        recipes.bankTransfer({
          transferId: schedule.id,
          occurrence,
          from: accountForSpace(from),
          to: accountForSpace(to),
          amount: schedule.amount,
          kind: 'scheduled',
        }),
      );

      await tx`
        UPDATE bank.transfer_executions
           SET status = 'settled', ledger_tx_id = ${posted.id}, settled_at = now()
         WHERE id = ${executionId}
      `;
      return 'settled';
    } catch (err) {
      // An empty space is an ordinary outcome for a standing order, not an
      // incident: record WHY and move on. The occurrence is consumed rather than
      // queued — a monthly transfer that failed in March is a March transfer,
      // and silently making it up in April would move money the user is no
      // longer expecting to move.
      if (err instanceof InsufficientFundsError || (err instanceof LedgerError && err.code === 'ledger.insufficient_funds')) {
        await tx`
          UPDATE bank.transfer_executions
             SET status = 'rejected', rejection_code = ${err.code}
           WHERE id = ${executionId}
        `;
        return 'rejected';
      }
      // Anything else — a network fault reaching svc-ledger, a frozen module —
      // must NOT consume the occurrence. Rethrowing rolls the claim back so the
      // next pass tries again.
      throw err;
    }
  }

  /** Firing history for a schedule — what ran, what did not, and why. */
  async executions(
    scheduleId: string,
  ): Promise<Array<{ occurrence: number; amount: string; status: string; ledgerTxId: string | null; rejectionCode: string | null }>> {
    const rows = await this.sql<
      Array<{ occurrence: number; amount: string; status: string; ledger_tx_id: string | null; rejection_code: string | null }>
    >`
      SELECT occurrence, amount, status, ledger_tx_id, rejection_code
        FROM bank.transfer_executions WHERE schedule_id = ${scheduleId} ORDER BY occurrence ASC
    `;
    return rows.map((r) => ({
      occurrence: r.occurrence,
      amount: formatAmount(parseAmount(r.amount)),
      status: r.status,
      ledgerTxId: r.ledger_tx_id,
      rejectionCode: r.rejection_code,
    }));
  }

  /** When occurrence `n` of a schedule is due — exposed for operator tooling and tests. */
  static occurrenceAt(startsAt: Date, cadence: Cadence, occurrence: number): Date {
    return occurrenceStart(startsAt, cadence, occurrence);
  }
}
