import type { Sql } from 'postgres';
import { transaction } from '@intafaced/db';
import { withMarketSpan } from './tracing.js';

/**
 * THE VENDOR LIFECYCLE — APPLY, THEN VET (§8.7, `market.vendors` Stage 1).
 *
 * A user applies to be a marketplace vendor; an operator decides. Every decision
 * is recorded next to the state it produced, in one transaction, so "why was
 * this vendor rejected" is answerable from the database.
 *
 * ── WHAT THIS FILE IS NOT ──────────────────────────────────────────────────
 *
 * IT DOES NOT DECIDE WHETHER AN APPLICATION IS GOOD. There is no criterion here,
 * no score, no automatic transition and nothing that calls this on a timer. No
 * vetting criterion exists anywhere in this repository — `market.vendors.md`
 * names it an open product question that belongs to the owner — so the API is
 * deliberately shaped like a log with a side effect rather than a decision
 * engine: an operator names the outcome and a reason, and this records it and
 * applies it. If a policy ever gets written, it CALLS this; it does not live in
 * it. Same posture, and mostly the same words, as
 * `services/svc-pay/src/merchant-state-service.ts` — which exists because
 * merchant state was enforced by a column nothing ever wrote.
 *
 * IT DOES NOT KNOW WHAT A STAKE IS. Stake-gated listing slots are Stage 2 and
 * the numbers behind them belong to svc-token (`economics/staking.ts`,
 * `vendorSlots`). No threshold, count or tier name appears in this service, and
 * `docs/ops/trk/market.vendors.md:76` is why: "market must not invent parallel
 * stake numbers".
 *
 * IT MOVES NO VALUE. There is no import of `@intafaced/ledger-client` in this
 * service and no column in its schema could hold an amount (§0.6). Purchases,
 * subscriptions and house commission are `market.commerce`.
 *
 * ── WHY THE TWO WRITES ARE ONE TRANSACTION ─────────────────────────────────
 *
 * `vendors.status` and the history row are written together or not at all. The
 * failure modes if they were not are asymmetric in an ugly way:
 *
 *   · status without history — a vendor is rejected and nobody can say why.
 *     Exactly the defect this table exists to prevent, reintroduced by a crash.
 *   · history without status — the log says a vendor was approved and they are
 *     not. The log is then WORSE than no log, because it looks like evidence and
 *     is false.
 *
 * The vendor row is locked FOR UPDATE first, so `from_status` is the status that
 * was actually in force when the change applied and not one read a moment
 * earlier by a different request.
 */

/**
 * The scope that authorises a vetting decision.
 *
 * Held here as well as on the procedure so the refusal survives a caller that
 * never goes through the router — an internal tool, a future policy engine, a
 * migration script. See `vet()`.
 */
export const MARKET_OPS_SCOPE = 'market:ops';

export class MarketError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly detail?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'MarketError';
  }
}

export type VendorStatus = 'applied' | 'approved' | 'rejected' | 'suspended';

/**
 * The outcomes an operator may name.
 *
 * `applied` is absent: that is where a row starts, and moving one back to it
 * would erase that it was ever decided.
 */
export type VetDecision = Exclude<VendorStatus, 'applied'>;

export interface VendorRecord {
  id: string;
  userId: string;
  displayName: string;
  description: string;
  status: VendorStatus;
  createdAt: string;
  updatedAt: string;
}

export interface VendorStatusEventRecord {
  id: string;
  seq: string;
  vendorId: string;
  fromStatus: VendorStatus;
  toStatus: VendorStatus;
  reason: string;
  actorId: string;
  actorScope: string;
  createdAt: string;
}

interface VendorRow {
  id: string;
  user_id: string;
  display_name: string;
  description: string;
  status: VendorStatus;
  created_at: Date;
  updated_at: Date;
}

interface StatusEventRow {
  id: string;
  seq: string;
  vendor_id: string;
  from_status: VendorStatus;
  to_status: VendorStatus;
  reason: string;
  actor_id: string;
  actor_scope: string;
  created_at: Date;
}

function toVendor(row: VendorRow): VendorRecord {
  return {
    id: row.id,
    userId: row.user_id,
    displayName: row.display_name,
    description: row.description,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function toEvent(row: StatusEventRow): VendorStatusEventRecord {
  return {
    id: row.id,
    // `bigserial` arrives as a string from postgres.js and stays one. It is an
    // ordering key, never arithmetic, and turning it into a `number` would put a
    // 2^53 ceiling on an append-only log for no benefit at all.
    seq: String(row.seq),
    vendorId: row.vendor_id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    reason: row.reason,
    actorId: row.actor_id,
    actorScope: row.actor_scope,
    createdAt: row.created_at.toISOString(),
  };
}

export interface ApplyInput {
  /** The applicant, from the authenticated principal. Never from a request body. */
  userId: string;
  displayName: string;
  description: string;
}

export interface VetInput {
  vendorId: string;
  /** The operator's decision. Nothing in this service computes it. */
  decision: VetDecision;
  /** Free text, required, and refused when blank. */
  reason: string;
  /** The authenticated operator. Never taken from a request body. */
  actorId: string;
  /** The scope the caller actually held when this was applied. */
  actorScope: string;
}

export class VendorService {
  constructor(private readonly sql: Sql) {}

  /**
   * Create the caller's own application, in `applied`.
   *
   * ONE PER USER, and the uniqueness is the database's rather than a read
   * followed by a write: two clicks a millisecond apart would both see "no
   * existing application" and both insert. `ON CONFLICT DO NOTHING` makes the
   * second one return no row, which is what the refusal below is built on.
   *
   * The status is not a parameter. An application that could be born approved is
   * an application nobody vetted.
   */
  async applyAsVendor(input: ApplyInput): Promise<VendorRecord> {
    const displayName = input.displayName.trim();
    const description = input.description.trim();
    if (displayName.length === 0) {
      throw new MarketError('A vendor application needs a display name', 'market.vendor_display_name_required');
    }
    if (description.length === 0) {
      throw new MarketError('A vendor application needs a description an operator can read', 'market.vendor_description_required');
    }

    return withMarketSpan('market.apply', { op: 'apply' }, async () => {
      const [row] = await this.sql<VendorRow[]>`
        INSERT INTO market.vendors (user_id, display_name, description)
        VALUES (${input.userId}, ${displayName}, ${description})
        ON CONFLICT (user_id) DO NOTHING
        RETURNING id, user_id, display_name, description, status, created_at, updated_at
      `;

      if (!row) {
        throw new MarketError(
          'This account already has a vendor application. Read it back rather than applying twice.',
          'market.vendor_already_applied',
        );
      }
      return toVendor(row);
    });
  }

  /** The caller's own application, or null if they have never made one. */
  async myVendor(userId: string): Promise<VendorRecord | null> {
    const [row] = await this.sql<VendorRow[]>`
      SELECT id, user_id, display_name, description, status, created_at, updated_at
        FROM market.vendors
       WHERE user_id = ${userId}
    `;
    return row ? toVendor(row) : null;
  }

  /**
   * The operator queue — oldest first, because the oldest undecided application
   * is the one that has been waiting longest and is the reason a queue exists.
   */
  async listApplications(options: { status?: VendorStatus; limit?: number } = {}): Promise<VendorRecord[]> {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    const status = options.status ?? null;
    const rows = await this.sql<VendorRow[]>`
      SELECT id, user_id, display_name, description, status, created_at, updated_at
        FROM market.vendors
       WHERE ${status === null ? this.sql`true` : this.sql`status = ${status}::market.vendor_status`}
       ORDER BY created_at ASC
       LIMIT ${limit}
    `;
    return rows.map(toVendor);
  }

  /**
   * Apply an operator's decision, and record who made it, when, and why.
   *
   * ── WHAT IT REFUSES ────────────────────────────────────────────────────────
   *
   * A CALLER THAT IS NOT AN OPERATOR — `market.vet_operator_required`. The
   * router already gates the procedure on the scope, so this looks redundant and
   * is not: the point of the refusal is that NOTHING in this codebase may decide
   * an application. A future policy engine, an internal tool or a script that
   * reached this method directly would otherwise write an approval with no human
   * behind it, and the audit row would record a scope that never authorised
   * anything. The precedent is `payment-service.ts`'s `decideKybStub`, which
   * refuses under live-only with `pay.kyb_operator_required` rather than
   * inventing an external vendor's answer.
   *
   * A BLANK REASON. Enforced here so the operator gets a sentence rather than a
   * constraint-violation string, and enforced again by a CHECK in the database
   * so it holds for anything that ever writes that table without coming through
   * here. Two checks: the first is for the operator, the second is for the
   * guarantee.
   *
   * A NO-OP. Setting a vendor to the status they already hold appends nothing
   * and changes nothing. It is not an error — an operator clicking twice is not
   * a fault — but it must not write a row, because a history full of
   * `approved → approved` is a history nobody reads, and a history nobody reads
   * is how the real rows get missed.
   *
   * ── WHAT IT DOES NOT REFUSE, AND WHY ───────────────────────────────────────
   *
   * ANY TRANSITION BETWEEN ANY TWO DECIDED STATES. Suspending an approved
   * vendor, reinstating a suspended one, approving a previously rejected
   * application — all permitted. That looks lax and is the deliberate half of
   * "do not invent a suspension policy": a transition map is a policy. It would
   * decide that rejection is final, that a suspension cannot be lifted, and half
   * a dozen other things nobody has ruled on. What the history buys is that
   * every transition, including a strange one, is attributable and dated.
   */
  async vet(input: VetInput): Promise<{ changed: boolean; vendor: VendorRecord; event: VendorStatusEventRecord | null }> {
    if (input.actorScope !== MARKET_OPS_SCOPE) {
      throw new MarketError(
        `Vetting a vendor application requires an operator holding "${MARKET_OPS_SCOPE}". ` +
          'Nothing in svc-market decides whether an application is good — there is no criterion to decide it with.',
        'market.vet_operator_required',
        { held: input.actorScope, required: MARKET_OPS_SCOPE },
      );
    }

    const reason = input.reason.trim();
    if (reason.length === 0) {
      throw new MarketError(
        'A vetting decision requires a reason. "Why was this vendor rejected" must be answerable from the database, ' +
          'and it is not answerable from an empty string.',
        'market.vet_reason_required',
      );
    }

    return withMarketSpan('market.vet', { op: 'vet', vendorId: input.vendorId }, async () =>
      transaction(
        this.sql,
        async (tx) => {
          // FOR UPDATE: `from_status` has to be the status that was in force when
          // this change applied, not one read a moment earlier by another
          // request. Two operators approving and suspending at the same instant
          // would otherwise both record the same `from`, and the log would show
          // two changes out of one state.
          const [vendor] = await tx<VendorRow[]>`
            SELECT id, user_id, display_name, description, status, created_at, updated_at
              FROM market.vendors
             WHERE id = ${input.vendorId}
             FOR UPDATE
          `;
          if (!vendor) {
            throw new MarketError(`No vendor application ${input.vendorId}`, 'market.vendor_not_found');
          }

          if (vendor.status === input.decision) {
            return { changed: false, vendor: toVendor(vendor), event: null };
          }

          const [updated] = await tx<VendorRow[]>`
            UPDATE market.vendors
               SET status = ${input.decision}::market.vendor_status, updated_at = now()
             WHERE id = ${input.vendorId}
             RETURNING id, user_id, display_name, description, status, created_at, updated_at
          `;

          const [row] = await tx<StatusEventRow[]>`
            INSERT INTO market.vendor_status_events (vendor_id, from_status, to_status, reason, actor_id, actor_scope)
            VALUES (
              ${input.vendorId},
              ${vendor.status}::market.vendor_status,
              ${input.decision}::market.vendor_status,
              ${reason},
              ${input.actorId},
              ${input.actorScope}
            )
            RETURNING id, seq, vendor_id, from_status, to_status, reason, actor_id, actor_scope, created_at
          `;

          if (!updated || !row) {
            // Unreachable through this path — both statements either return a
            // row or throw. Stated rather than asserted away with `!`, because a
            // silent `undefined` here would return `event: null`, which is the
            // shape of a NO-OP: the status would have changed and the caller
            // would be told nothing was recorded.
            throw new MarketError(
              `Vendor ${input.vendorId} was decided but the history row was not returned. The change has been rolled back.`,
              'market.vet_history_not_written',
            );
          }

          return { changed: true, vendor: toVendor(updated), event: toEvent(row) };
        },
        { isolation: 'read committed', maxAttempts: 5 },
      ),
    );
  }

  /**
   * The history, newest first — the answer to "why was this vendor rejected".
   *
   * Newest first because the question is almost always about the CURRENT state,
   * and the row that explains it is the last one written.
   */
  async history(vendorId: string, limit = 50): Promise<VendorStatusEventRecord[]> {
    const rows = await this.sql<StatusEventRow[]>`
      SELECT id, seq, vendor_id, from_status, to_status, reason, actor_id, actor_scope, created_at
        FROM market.vendor_status_events
       WHERE vendor_id = ${vendorId}
       ORDER BY seq DESC
       LIMIT ${Math.min(Math.max(limit, 1), 200)}
    `;
    return rows.map(toEvent);
  }
}
