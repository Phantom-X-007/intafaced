import type { Sql } from 'postgres';
import { transaction } from '@intafaced/db';

/**
 * THE WRITER FOR `merchants.status`, AND THE HISTORY BEHIND IT (§6.1).
 *
 * ── THE DEFECT THIS CLOSES ─────────────────────────────────────────────────
 *
 * `docs/adr/2026-08-04-pay-rails-and-psp-socket.md` (Accepted):
 *
 *   "Merchant state has no history and no writer. `status='suspended'` is read
 *    and enforced by a code path that nothing writes. Merchant MONEY is already
 *    irreversible while merchant STATE is unrecorded — so a suspension cannot be
 *    explained, dated, or undone, and an operator cannot answer 'why is this
 *    merchant suspended' from the database."
 *
 * Every word of that was true at write time. `payment-service.ts` now refuses a
 * payment, a public checkout, a new payment link, a new settlement freeze, a
 * settlement post, and a settlement payout for a merchant whose status is not
 * `active` — one code (`pay.merchant_inactive`) on every money-moving surface
 * that should cut off. The writer for `status` still lives only here (and the
 * tests that drop raw SQL); nothing else invents a suspension policy.
 *
 * ── WHAT THIS FILE IS NOT ──────────────────────────────────────────────────
 *
 * IT DOES NOT DECIDE WHEN A MERCHANT SHOULD BE SUSPENDED. There is no threshold
 * here, no dispute-rate rule, no automatic transition, and nothing that calls
 * this on a timer. Recording who, when and why is not deciding when — the second
 * is product policy and belongs to the owner. A suspension policy that arrived
 * quietly inside an audit-trail change would be the worst way to introduce one.
 *
 * So the API is deliberately shaped like a log with a side effect rather than
 * like a decision engine: an operator names the target state and a reason, and
 * this records it and applies it. If a policy engine is ever written, it calls
 * this; it does not live in it.
 *
 * ── WHY THE TWO WRITES ARE ONE TRANSACTION ─────────────────────────────────
 *
 * `merchants.status` and the history row are written together or not at all, and
 * the failure modes if they were not are asymmetric in an ugly way:
 *
 *   · status without history — a merchant is cut off and nobody can say why.
 *     Exactly the defect being fixed, reintroduced by a crash.
 *   · history without status — the log says a merchant was suspended and they
 *     are still taking money. The log is then WORSE than no log, because it
 *     looks like evidence and is false.
 *
 * The merchant row is locked FOR UPDATE first, so `from_status` is the status
 * that was actually in force when the change was applied and not one read a
 * moment earlier by a different request.
 */

export class MerchantStateError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly detail?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'MerchantStateError';
  }
}

/** merchantState.history page size unpublished. Blank / non-finite / <1 refuses. Never invent 50. */
export function assertMerchantStateHistoryLimit(limit: number | undefined): number {
  if (limit === undefined || typeof limit !== 'number' || !Number.isFinite(limit)) {
    throw new MerchantStateError(
      'merchantState.history page size is unset. Blank refuses — never 50. Pass a positive integer (50 is allowed if explicit).',
      'pay.merchant_state_history_limit_unset',
    );
  }
  const n = Math.floor(limit);
  if (n < 1) {
    throw new MerchantStateError(
      'merchantState.history page size is unset. Blank refuses — never 50. Pass a positive integer (50 is allowed if explicit).',
      'pay.merchant_state_history_limit_unset',
    );
  }
  return Math.min(200, n);
}

export type MerchantStatus = 'pending' | 'active' | 'suspended' | 'closed';

/** Every status a merchant row may hold. The database enum is the authority. */
export const MERCHANT_STATUSES: readonly MerchantStatus[] = ['pending', 'active', 'suspended', 'closed'];

export interface MerchantStatusChange {
  merchantId: string;
  to: MerchantStatus;
  /** Free text, required, and refused when blank. See `reason` in the migration. */
  reason: string;
  /** The authenticated operator. Never taken from a request body. */
  actorId: string;
  /** The scope the caller actually held when this was applied. */
  actorScope: string;
}

export interface MerchantStatusEventRecord {
  id: string;
  seq: string;
  merchantId: string;
  fromStatus: MerchantStatus;
  toStatus: MerchantStatus;
  reason: string;
  actorId: string;
  actorScope: string;
  createdAt: Date;
}

interface StatusEventRow {
  id: string;
  seq: string;
  merchant_id: string;
  from_status: MerchantStatus;
  to_status: MerchantStatus;
  reason: string;
  actor_id: string;
  actor_scope: string;
  created_at: Date;
}

function toEvent(row: StatusEventRow): MerchantStatusEventRecord {
  return {
    id: row.id,
    // `bigserial` arrives as a string from postgres.js and stays one. It is an
    // ordering key, never arithmetic, and turning it into a `number` would put a
    // 2^53 ceiling on an append-only log for no benefit at all.
    seq: String(row.seq),
    merchantId: row.merchant_id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    reason: row.reason,
    actorId: row.actor_id,
    actorScope: row.actor_scope,
    createdAt: row.created_at,
  };
}

export class MerchantStateService {
  constructor(private readonly sql: Sql) {}

  /**
   * Set a merchant's status, and record who did it, when, and why.
   *
   * ── WHAT IT REFUSES ────────────────────────────────────────────────────────
   *
   * A BLANK REASON. Enforced here so the caller gets a sentence rather than a
   * constraint-violation string, and enforced again by a CHECK in the database
   * so it holds for anything that ever writes this table without coming through
   * here. Two checks, because the first is for the operator and the second is
   * for the guarantee.
   *
   * A NO-OP. Setting a merchant to the status they already hold appends nothing
   * and changes nothing. It is not an error — an operator clicking twice is not
   * a fault — but it must not write a row, because a history full of
   * `active → active` is a history nobody reads, and a history nobody reads is
   * how the real rows get missed.
   *
   * ── WHAT IT DOES NOT REFUSE, AND WHY ───────────────────────────────────────
   *
   * ANY TRANSITION BETWEEN ANY TWO STATUSES IS PERMITTED, including out of
   * `closed`. That looks lax and is the deliberate half of "do not invent a
   * suspension policy": a transition map is a policy — it decides that closure
   * is final, that a pending merchant may be suspended before being approved,
   * and half a dozen other things nobody has ruled on. `payments` has a
   * transition map because §6.1 states one. Merchant state does not have one
   * yet, and inventing it here would smuggle in product law under an audit
   * change. What the history buys is that every transition, including a strange
   * one, is attributable and dated.
   */
  async setStatus(change: MerchantStatusChange): Promise<{ changed: boolean; event: MerchantStatusEventRecord | null }> {
    const reason = change.reason.trim();
    if (reason.length === 0) {
      throw new MerchantStateError(
        'A merchant status change requires a reason. "Why is this merchant suspended" must be answerable from the database, ' +
          'and it is not answerable from an empty string.',
        'pay.merchant_status_reason_required',
      );
    }
    if (!MERCHANT_STATUSES.includes(change.to)) {
      throw new MerchantStateError(`Unknown merchant status "${change.to}"`, 'pay.merchant_status_unknown', {
        known: MERCHANT_STATUSES,
      });
    }

    return transaction(
      this.sql,
      async (tx) => {
        // FOR UPDATE: `from_status` has to be the status that was in force when
        // this change applied, not one read a moment earlier by another request.
        // Two operators suspending and reinstating at the same instant would
        // otherwise both record the same `from`, and the log would show two
        // changes out of one state.
        const [merchant] = await tx<Array<{ id: string; status: MerchantStatus }>>`
          SELECT id, status FROM pay.merchants WHERE id = ${change.merchantId} FOR UPDATE
        `;
        if (!merchant) {
          throw new MerchantStateError(`No merchant ${change.merchantId}`, 'pay.merchant_not_found');
        }

        if (merchant.status === change.to) {
          return { changed: false, event: null };
        }

        await tx`
          UPDATE pay.merchants
             SET status = ${change.to}::pay.merchant_status, updated_at = now()
           WHERE id = ${change.merchantId}
        `;

        const [row] = await tx<StatusEventRow[]>`
          INSERT INTO pay.merchant_status_events (merchant_id, from_status, to_status, reason, actor_id, actor_scope)
          VALUES (
            ${change.merchantId},
            ${merchant.status}::pay.merchant_status,
            ${change.to}::pay.merchant_status,
            ${reason},
            ${change.actorId},
            ${change.actorScope}
          )
          RETURNING id, seq, merchant_id, from_status, to_status, reason, actor_id, actor_scope, created_at
        `;

        if (!row) {
          // Unreachable through this path — the INSERT above either returns a
          // row or throws. Stated rather than asserted away with `!`, because a
          // silent `undefined` here would return `event: null`, which is the
          // shape of a NO-OP: the status would have changed and the caller would
          // be told nothing was recorded.
          throw new MerchantStateError(
            `Merchant ${change.merchantId} status changed but the history row was not returned. The change has been rolled back.`,
            'pay.merchant_status_history_not_written',
          );
        }

        return { changed: true, event: toEvent(row) };
      },
      { isolation: 'read committed', maxAttempts: 5 },
    );
  }

  /**
   * The history, newest first — the answer to "why is this merchant suspended".
   *
   * Newest first because the question is almost always about the CURRENT state,
   * and the row that explains it is the last one written. Oldest-first would put
   * the answer at the bottom of a list whose length grows with how long the
   * merchant has been a customer.
   */
  async history(merchantId: string, limit?: number): Promise<MerchantStatusEventRecord[]> {
    const page = assertMerchantStateHistoryLimit(limit);
    const rows = await this.sql<StatusEventRow[]>`
      SELECT id, seq, merchant_id, from_status, to_status, reason, actor_id, actor_scope, created_at
        FROM pay.merchant_status_events
       WHERE merchant_id = ${merchantId}
       ORDER BY seq DESC
       LIMIT ${page}
    `;
    return rows.map(toEvent);
  }

  /**
   * The current status, read back from the row rather than from the log.
   *
   * Deliberately not derived by replaying the history. The column is what
   * `payment-service.ts` enforces against, so it is what an operator console
   * must show — a console that displayed a replayed value would agree with the
   * enforcement right up until the two diverged, which is the one moment it
   * matters.
   */
  async currentStatus(merchantId: string): Promise<MerchantStatus> {
    const [row] = await this.sql<Array<{ status: MerchantStatus }>>`
      SELECT status FROM pay.merchants WHERE id = ${merchantId}
    `;
    if (!row) throw new MerchantStateError(`No merchant ${merchantId}`, 'pay.merchant_not_found');
    return row.status;
  }
}
