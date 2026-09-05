import type { Sql } from 'postgres';
import { transaction } from '@intafaced/db';
import {
  canTransition,
  checkEligibility,
  DEFAULT_ELIGIBILITY,
  describeReputationSnapshot,
  mayGrantProgrammePrivileges,
  standingBrokenByDisputeLaw,
  type EligibilityPolicy,
  type MerchantStatus,
  type TransitionActor,
} from './merchant-programme.js';
import { P2pError, type P2pService } from './p2p-service.js';
import { P2P_COPY, resolveP2pCopy } from './user-copy.js';

/** Owner-published merchants.history page size. Blank / non-finite / <1 refuses. Never invent 50. */
export function assertMerchantHistoryLimit(limit: number | undefined): number {
  if (limit === undefined || typeof limit !== 'number' || !Number.isFinite(limit)) {
    throw new P2pError(resolveP2pCopy(P2P_COPY.merchantHistoryLimitUnset), 'p2p.merchant_history_limit_unset');
  }
  const n = Math.floor(limit);
  if (n < 1) {
    throw new P2pError(resolveP2pCopy(P2P_COPY.merchantHistoryLimitUnset), 'p2p.merchant_history_limit_unset');
  }
  return Math.min(200, n);
}

/**
 * THE P2P MERCHANT PROGRAMME — the writer and the history.
 *
 * `TRK-p2p.merchants.md` Stage 1: schema + apply/approve. `merchant-programme.ts`
 * holds the rules; this file is the only thing that writes them down.
 *
 * ── EVERY TRANSITION LEAVES A ROW ────────────────────────────────────────
 *
 * `p2p_merchant_events` is append-only and enforced by a trigger, for the
 * reason svc-pay's ADR gives about its own merchants: an operator must be able
 * to answer "why is this merchant suspended" from the database. A status column
 * alone cannot, and a standing that changes without a record is one nobody can
 * defend a decision about — least of all to the merchant.
 *
 * ── NO MONEY HERE, AND THAT IS THE POINT ─────────────────────────────────
 *
 * Membership is not a balance and grants no custody. Escrow still moves every
 * coin through `ledger-client` recipes exactly as it does for an ordinary
 * trader (§0.6). Stage 1 is membership; Stage 2 (offer ceilings) lives in
 * `merchant-limits.ts` and reads this table. Stage 3 consumes the existing
 * shared planes rather than rebuilding them: identity owns named keys, scopes
 * and revocation; the edge owns request throttling; router.ts re-reads this
 * standing on every API-key call. Only `approved` proceeds, so suspension is
 * an immediate API revoke. Machine credentials never moderate disputes.
 */

export interface MerchantRecord {
  readonly userId: string;
  readonly status: MerchantStatus;
  /** Reputation as it stood when they applied — see the migration for why it is stored. */
  readonly appliedCompletionRate: number;
  readonly appliedTradesTotal: number;
  readonly appliedAt: Date;
  readonly decidedAt: Date | null;
}

export interface MerchantEvent {
  readonly seq: string;
  readonly fromStatus: MerchantStatus;
  readonly toStatus: MerchantStatus;
  readonly reason: string;
  readonly actorId: string;
  readonly actorScope: string;
  readonly createdAt: Date;
}

interface MerchantRow {
  user_id: string;
  status: MerchantStatus;
  applied_completion_rate: string;
  applied_trades_total: number;
  applied_at: Date;
  decided_at: Date | null;
}

function toRecord(row: MerchantRow): MerchantRecord {
  return {
    userId: row.user_id,
    status: row.status,
    appliedCompletionRate: Number(row.applied_completion_rate),
    appliedTradesTotal: Number(row.applied_trades_total),
    appliedAt: row.applied_at,
    decidedAt: row.decided_at,
  };
}

export interface MerchantServiceOptions {
  /**
   * Thresholds. Product law is an open question in the spec (§5), so the
   * numbers arrive from configuration rather than being frozen into the rule.
   */
  readonly eligibility?: EligibilityPolicy;
}

export class MerchantService {
  private readonly eligibility: EligibilityPolicy;

  constructor(
    private readonly sql: Sql,
    private readonly p2p: P2pService,
    options: MerchantServiceOptions = {},
  ) {
    this.eligibility = options.eligibility ?? DEFAULT_ELIGIBILITY;
  }

  /**
   * Apply, on your own behalf.
   *
   * Eligibility is checked against EARNED reputation — the spec's second DoD
   * line — and the snapshot that justified the application is written onto the
   * row, because reputation moves and a decision has to remain explicable.
   */
  async apply(userId: string, actorScope: string): Promise<MerchantRecord> {
    const snapshot = await this.p2p.reputationOf(userId);
    const verdict = checkEligibility(snapshot, this.eligibility);
    if (!verdict.eligible) {
      throw new P2pError(verdict.reason, 'p2p.merchant_ineligible');
    }

    return transaction(
      this.sql,
      async (tx) => {
        /**
         * A live application blocks a second one; a FINISHED one does not.
         * Re-entry after a rejection or withdrawal is a new application by
         * design — it re-runs eligibility against current reputation instead
         * of restoring a standing that was taken away.
         */
        const [existing] = await tx<MerchantRow[]>`
          SELECT * FROM p2p.p2p_merchants WHERE user_id = ${userId} FOR UPDATE
        `;
        if (existing && (existing.status === 'applied' || existing.status === 'approved' || existing.status === 'suspended')) {
          throw new P2pError(`This account is already ${existing.status} in the merchant programme.`, 'p2p.merchant_exists');
        }

        const rate = snapshot.completionRate.toFixed(4);
        const [row] = await tx<MerchantRow[]>`
          INSERT INTO p2p.p2p_merchants (user_id, status, applied_completion_rate, applied_trades_total, applied_at, decided_at)
          VALUES (${userId}, 'applied', ${rate}::numeric, ${snapshot.tradesTotal}, now(), NULL)
          ON CONFLICT (user_id) DO UPDATE
            SET status = 'applied',
                applied_completion_rate = ${rate}::numeric,
                applied_trades_total = ${snapshot.tradesTotal},
                applied_at = now(),
                decided_at = NULL,
                updated_at = now()
          RETURNING *
        `;
        if (!row) throw new P2pError('merchant application did not persist', 'p2p.merchant_ineligible');

        await tx`
          INSERT INTO p2p.p2p_merchant_events (user_id, from_status, to_status, reason, actor_id, actor_scope)
          VALUES (${userId}, ${existing?.status ?? 'withdrawn'}, 'applied',
                  ${`Applied with ${snapshot.tradesTotal} escrowed trades at ${(snapshot.completionRate * 100).toFixed(2)}% completion.`},
                  ${userId}, ${actorScope})
        `;

        return toRecord(row);
      },
      { isolation: 'read committed', maxAttempts: 5 },
    );
  }

  /**
   * Move a merchant, as an operator or as themselves.
   *
   * The actor is passed in from the authenticated principal — never from a
   * request body, or the history records who the caller said they were.
   */
  async transition(input: {
    userId: string;
    to: MerchantStatus;
    by: TransitionActor;
    reason: string;
    actorId: string;
    actorScope: string;
  }): Promise<MerchantRecord> {
    const reason = input.reason.trim();
    if (!reason) {
      // The database refuses a blank reason too. This is the same rule said
      // where the caller can act on it, rather than as a constraint violation.
      throw new P2pError('A reason is required: an unexplained change of standing is not reviewable.', 'p2p.merchant_reason_required');
    }

    const currentStanding = await this.get(input.userId);
    if (!currentStanding) throw new P2pError('No merchant application for this account.', 'p2p.merchant_not_found');

    const freezing = currentStanding.status === 'approved' && input.to === 'suspended';
    /**
     * ANY grant of `approved` re-reads live reputation — first approval as
     * well as unfreeze. Restore already refused a failing snapshot; first
     * approval used to stamp the badge on the apply-time row even after a
     * later dispute loss. Same rule, same sentence, both edges.
     */
    const granting = input.to === 'approved';
    let recordedReason = reason;
    if (freezing || granting) {
      const snapshot = await this.p2p.reputationOf(input.userId);
      if (granting) {
        const grant = mayGrantProgrammePrivileges(snapshot, this.eligibility);
        if (!grant.eligible) {
          throw new P2pError(
            `Cannot grant programme privileges while live reputation fails the same rule badges use. ${grant.reason}`,
            'p2p.merchant_ineligible',
          );
        }
      }
      const moment = granting ? (currentStanding.status === 'suspended' ? 'restore' : 'approve') : 'freeze';
      recordedReason = `${reason} Snapshot at ${moment}: ${describeReputationSnapshot(snapshot)}.`;
    }

    return transaction(
      this.sql,
      async (tx) => {
        const [current] = await tx<MerchantRow[]>`
          SELECT * FROM p2p.p2p_merchants WHERE user_id = ${input.userId} FOR UPDATE
        `;
        if (!current) throw new P2pError('No merchant application for this account.', 'p2p.merchant_not_found');

        const verdict = canTransition(current.status, input.to, input.by);
        if (!verdict.allowed) throw new P2pError(verdict.reason, 'p2p.merchant_transition_invalid');

        const [row] = await tx<MerchantRow[]>`
          UPDATE p2p.p2p_merchants
             SET status = ${input.to}, decided_at = now(), updated_at = now()
           WHERE user_id = ${input.userId}
          RETURNING *
        `;
        if (!row) throw new P2pError('merchant transition did not persist', 'p2p.merchant_transition_invalid');

        await tx`
          INSERT INTO p2p.p2p_merchant_events (user_id, from_status, to_status, reason, actor_id, actor_scope)
          VALUES (${input.userId}, ${current.status}, ${input.to}, ${recordedReason}, ${input.actorId}, ${input.actorScope})
        `;

        return toRecord(row);
      },
      { isolation: 'read committed', maxAttempts: 5 },
    );
  }

  async get(userId: string): Promise<MerchantRecord | null> {
    const [row] = await this.sql<MerchantRow[]>`SELECT * FROM p2p.p2p_merchants WHERE user_id = ${userId}`;
    return row ? toRecord(row) : null;
  }

  /**
   * Suspend approved standing when live reputation no longer meets programme
   * rules — called after a human moderator attributes a dispute loss.
   *
   * Idempotent for non-approved rows. Leaves a reviewable history row naming
   * the dispute; does not move escrow (the ruling already did, via ledger).
   */
  async suspendIfStandingBrokenByDisputeLaw(input: {
    userId: string;
    tradeId: string;
    disputeId: string;
    actorId: string;
    actorScope: string;
  }): Promise<MerchantRecord | null> {
    const current = await this.get(input.userId);
    if (!current) return null;

    const snapshot = await this.p2p.reputationOf(input.userId);
    const broken = standingBrokenByDisputeLaw(current.status, snapshot, this.eligibility);
    if (!broken.broken) return null;

    return this.transition({
      userId: input.userId,
      to: 'suspended',
      by: 'operator',
      reason:
        `Dispute law: merchant standing suspended after moderated ruling on trade ${input.tradeId} ` +
        `(dispute ${input.disputeId}). ${broken.reason}`,
      actorId: input.actorId,
      actorScope: input.actorScope,
    });
  }

  /** Newest first — the current standing is what somebody is usually asking about. */
  async history(userId: string, limit?: number): Promise<MerchantEvent[]> {
    const lim = assertMerchantHistoryLimit(limit);
    const rows = await this.sql<
      Array<{
        seq: string;
        from_status: MerchantStatus;
        to_status: MerchantStatus;
        reason: string;
        actor_id: string;
        actor_scope: string;
        created_at: Date;
      }>
    >`
      SELECT seq::text, from_status, to_status, reason, actor_id, actor_scope, created_at
        FROM p2p.p2p_merchant_events
       WHERE user_id = ${userId}
       ORDER BY seq DESC
       LIMIT ${lim}
    `;
    return rows.map((r) => ({
      seq: r.seq,
      fromStatus: r.from_status,
      toStatus: r.to_status,
      reason: r.reason,
      actorId: r.actor_id,
      actorScope: r.actor_scope,
      createdAt: r.created_at,
    }));
  }
}
