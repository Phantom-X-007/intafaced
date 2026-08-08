import type { Sql } from 'postgres';
import { transaction } from '@intafaced/db';
import { withMarketSpan } from './tracing.js';
import { decideVendorSlot, usableSlots } from './slot-access.js';
import type { SlotEntitlementSource } from './stake-source.js';

/**
 * THE VENDOR LIFECYCLE — APPLY, THEN VET (Stage 1), AND THE STAKE-GATED LISTING
 * SLOTS THAT SIT ON TOP OF IT (Stage 2) — §8.7, `market.vendors`.
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
 * IT DOES NOT DECIDE WHEN TO SUSPEND EITHER, and Stage 2 does not change that.
 * A slot is released when a vendor stops being approved, but the TRANSITION is
 * still something an operator recorded through `vet`. Reacting to a state
 * somebody else wrote is not the same thing as deciding it, and nothing here
 * suspends a vendor on a timer, a threshold or an offence count.
 *
 * IT STILL RESTATES NO STAKE NUMBER. Stage 2 reads slot capacity from svc-token
 * at claim time (`stake-source.ts`); the tier schedule itself stays in
 * `economics/staking.ts`. No threshold, slot count or tier name is written down
 * in this service or its schema, and `docs/ops/trk/market.vendors.md:76` is why:
 * "market must not invent parallel stake numbers".
 *
 * IT MOVES NO VALUE. There is no import of `@intafaced/ledger-client` in this
 * service and no column in its schema could hold an amount (§0.6). Purchases,
 * subscriptions and house commission are `market.commerce`. Stage 2 deliberately
 * reads only `tier.vendorSlots` off svc-token and ignores the `staked` and
 * `minStake` amounts it also returns, so no money crosses into this process at
 * all.
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

/** One listing slot a vendor has taken up. Holds no amount and no capacity. */
export interface VendorSlotRecord {
  id: string;
  vendorId: string;
  ref: string;
  claimedAt: string;
  releasedAt: string | null;
}

/**
 * What a vendor's slot position actually is, right now.
 *
 * `capacity` and `tier` are re-read from svc-token on every call rather than
 * stored — see `slot-access.ts` `usableSlots` for why that re-derivation is the
 * mechanism behind "under-staked vendors cannot present as listed" (DoD clause
 * 5) rather than a subscription to an unstake event that does not exist.
 */
export interface VendorSlotStatus {
  vendorId: string;
  status: VendorStatus;
  /** svc-token's tier name, for display. Never computed here. */
  tier: string;
  /** `AccessTier.vendorSlots` as svc-token reported it this second. */
  capacity: number;
  /** Slots held and not released. */
  held: number;
  /** Of those, how many the CURRENT tier and status actually cover. */
  usable: number;
  slots: VendorSlotRecord[];
}

interface SlotRow {
  id: string;
  vendor_id: string;
  ref: string;
  claimed_at: Date;
  released_at: Date | null;
}

function toSlot(row: SlotRow): VendorSlotRecord {
  return {
    id: row.id,
    vendorId: row.vendor_id,
    ref: row.ref,
    claimedAt: row.claimed_at.toISOString(),
    releasedAt: row.released_at ? row.released_at.toISOString() : null,
  };
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
  /**
   * `stakes` is REQUIRED, not optional with a permissive default. An optional
   * entitlement source is a production fallback by another name: the day
   * somebody constructs this service without one, every slot claim would be
   * decided by whatever the default said, and the default would be wrong in the
   * generous direction. Tests pass `FixedEntitlement` explicitly (stake-source.ts).
   */
  constructor(
    private readonly sql: Sql,
    private readonly stakes: SlotEntitlementSource,
  ) {}

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

          /**
           * RELEASE ON SUSPENSION — DoD "release on unstake / offence /
           * suspension", in the SAME TRANSACTION as the transition that caused it.
           *
           * Not a separate call, and the reason is the one three paragraphs of
           * this file's header already make about status and history: two writes
           * that must both happen, split across two transactions, means a crash
           * in between leaves a suspended vendor still holding every slot they
           * had. That is the exact failure clause 5 exists to prevent, and it
           * would be invisible — the vendor row would read `suspended` and look
           * correct.
           *
           * `!== 'approved'` rather than `=== 'suspended'`: a REJECTED vendor
           * must not keep slots either, and a status added later should default
           * to releasing rather than to keeping. Fail closed on the enum too.
           *
           * This is not a suspension POLICY. Nothing here decides that a vendor
           * should be suspended; an operator already did, and this reacts to what
           * they recorded.
           */
          if (input.decision !== 'approved') {
            await tx`
              UPDATE market.vendor_slots SET released_at = now()
               WHERE vendor_id = ${input.vendorId} AND released_at IS NULL
            `;
          }

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

  // ── Stage 2: stake-gated listing slots ─────────────────────────────────────

  /** Slots held and not released. A COUNT, never a maintained counter. */
  async openSlotCount(vendorId: string, tx: Sql = this.sql): Promise<number> {
    const rows = await tx<Array<{ count: string }>>`
      SELECT COUNT(*)::text AS count FROM market.vendor_slots WHERE vendor_id = ${vendorId} AND released_at IS NULL
    `;
    return Number(rows[0]?.count ?? '0');
  }

  /**
   * Take a listing slot.
   *
   * ── WHY THE SLOT IS CLAIMED UNDER A LOCK ───────────────────────────────────
   *
   * A capacity is only a capacity if two requests racing for the last slot
   * cannot both get it. The insert runs inside a transaction that locks the
   * VENDOR row first, so the occupancy count and the insert cannot interleave —
   * which is what makes `read committed` correct here (packages/db/src/
   * connection.ts explains when it is and when it is not). Same pattern, and
   * mostly the same words, as `svc-academy`'s seat claim.
   *
   * ── WHY THE STAKE READ HAPPENS BEFORE THE LOCK ─────────────────────────────
   *
   * Deliberately, and it is the subtle half. A stake lookup is a network call to
   * svc-token. Holding the vendor's row across one would serialise every claim
   * that vendor makes behind svc-token's latency, and under an outage it would
   * hold the lock for the full fetch timeout. The capacity read a few
   * milliseconds early is not a correctness problem: the number it produces is
   * an ENTITLEMENT, and a stale entitlement can only ever admit a claim the
   * vendor was entitled to moments ago. What must not be stale is the OCCUPANCY,
   * and that is counted inside the lock.
   *
   * ── AND WHY IT IS IDEMPOTENT ───────────────────────────────────────────────
   *
   * A retried request must not consume a second slot for the same listing. The
   * already-held check runs inside the lock, so two simultaneous retries of one
   * claim resolve to one slot rather than racing each other — which is the same
   * oversell this method exists to prevent, arriving by the back door.
   */
  async claimSlot(input: { userId: string; ref: string }): Promise<{ claimed: boolean; slot: VendorSlotRecord }> {
    const ref = input.ref.trim();
    if (ref.length === 0) {
      throw new MarketError('A slot claim needs a reference naming what the slot is for', 'market.slot_ref_required');
    }

    const vendor = await this.myVendor(input.userId);
    if (!vendor) {
      throw new MarketError('You have not applied to be a vendor', 'market.vendor_not_found');
    }

    // Before the lock. See the header above — this is a network call.
    const entitlement = await this.stakes.entitlementOf(input.userId);

    return withMarketSpan('market.slot.claim', { op: 'slot.claim', vendorId: vendor.id }, async (span) => {
      span.setAttribute('intafaced.market.slot_capacity', entitlement.vendorSlots);

      const outcome = await transaction(
        this.sql,
        async (tx) => {
          /**
           * The status comes from THIS row read, not from `myVendor` above. An
           * operator suspending the vendor between those two reads must win, and
           * a status read outside the lock would let a suspended vendor take a
           * slot the same instant their suspension was recorded.
           */
          const [locked] = await tx<Array<{ id: string; status: VendorStatus }>>`
            SELECT id, status FROM market.vendors WHERE id = ${vendor.id} FOR UPDATE
          `;
          if (!locked) throw new MarketError(`No vendor application ${vendor.id}`, 'market.vendor_not_found');

          const [existing] = await tx<SlotRow[]>`
            SELECT id, vendor_id, ref, claimed_at, released_at
              FROM market.vendor_slots
             WHERE vendor_id = ${vendor.id} AND ref = ${ref} AND released_at IS NULL
          `;
          if (existing) return { decision: { allowed: true } as const, claimed: false, slot: toSlot(existing), open: -1 };

          const open = await this.openSlotCount(vendor.id, tx);
          const decision = decideVendorSlot({ status: locked.status, capacity: entitlement.vendorSlots }, { open });
          if (!decision.allowed) return { decision, claimed: false, slot: null, open };

          const [row] = await tx<SlotRow[]>`
            INSERT INTO market.vendor_slots (vendor_id, ref)
            VALUES (${vendor.id}, ${ref})
            RETURNING id, vendor_id, ref, claimed_at, released_at
          `;
          if (!row) {
            // Unreachable: the insert either returns a row or throws. Stated
            // rather than asserted away, because a silent undefined here would
            // report a claim that did not happen.
            throw new MarketError('The slot was claimed but not returned. The claim has been rolled back.', 'market.slot_not_written');
          }
          return { decision, claimed: true, slot: toSlot(row), open };
        },
        { isolation: 'read committed', maxAttempts: 5 },
      );

      if (outcome.open >= 0) span.setAttribute('intafaced.market.slots_open', outcome.open);
      // A refusal is invisible from the outside — nobody files a ticket for a
      // slot they could not take. This attribute is the only place "how many
      // bounced off the stake gate" is a number.
      span.setAttribute('intafaced.decision', outcome.decision.allowed ? 'allowed' : outcome.decision.code);

      if (!outcome.decision.allowed) throw new MarketError(outcome.decision.reason, outcome.decision.code);
      return { claimed: outcome.claimed, slot: outcome.slot! };
    });
  }

  /**
   * Give a slot back.
   *
   * NO LOCK, and that is not an oversight: releasing only ever FREES capacity.
   * Two concurrent releases of the same slot both land on the same row and the
   * second updates nothing, because the `released_at IS NULL` predicate has
   * already stopped matching. There is no interleaving here that could oversell
   * anything, and taking the vendor's row would put every release in the queue
   * behind every claim for no gain.
   *
   * No stake read either. A vendor who has lost their stake must still be able
   * to tidy up, and refusing a release because svc-token is unreachable would
   * fail closed in the direction that helps nobody.
   */
  async releaseSlot(input: { userId: string; ref: string }): Promise<{ released: boolean }> {
    const vendor = await this.myVendor(input.userId);
    if (!vendor) throw new MarketError('You have not applied to be a vendor', 'market.vendor_not_found');

    return withMarketSpan('market.slot.release', { op: 'slot.release', vendorId: vendor.id }, async () => {
      const rows = await this.sql<SlotRow[]>`
        UPDATE market.vendor_slots SET released_at = now()
         WHERE vendor_id = ${vendor.id} AND ref = ${input.ref.trim()} AND released_at IS NULL
         RETURNING id, vendor_id, ref, claimed_at, released_at
      `;
      // `false` rather than a 404: "that slot is not held" is an answer, and it
      // is the same answer a retried release should get.
      return { released: rows.length > 0 };
    });
  }

  /**
   * A vendor's slot position, with entitlement re-read from svc-token.
   *
   * ── THIS READ IS WHERE DoD CLAUSE 5 IS ENFORCED ────────────────────────────
   *
   * "Suspended / under-staked vendors cannot present as listed." A suspended
   * vendor's slots were released by `vet` in the same transaction as the
   * suspension — but an under-staked one's were not, because svc-market never
   * learns that somebody unstaked. There is no bus subject for it, and inventing
   * one with no publisher is what `tooling/ci/event-wiring.mjs` correctly reds
   * on; polling svc-token on a timer would be a second source of truth that is
   * wrong between ticks.
   *
   * So entitlement is re-derived HERE, on every read, against the tier svc-token
   * reports this second. `usable` is what Stage 3's public profile consumes; a
   * vendor who has dropped to Base reads `usable: 0` immediately, whether or not
   * any release ever happened.
   *
   * FAILS CLOSED. If svc-token cannot be reached this throws
   * `market.stake_unavailable` rather than returning the held count with a
   * guessed capacity — a read that cannot verify entitlement must not report a
   * vendor as listable.
   */
  async slotStatus(userId: string): Promise<VendorSlotStatus> {
    const vendor = await this.myVendor(userId);
    if (!vendor) throw new MarketError('You have not applied to be a vendor', 'market.vendor_not_found');

    const entitlement = await this.stakes.entitlementOf(userId);

    const rows = await this.sql<SlotRow[]>`
      SELECT id, vendor_id, ref, claimed_at, released_at
        FROM market.vendor_slots
       WHERE vendor_id = ${vendor.id} AND released_at IS NULL
       ORDER BY claimed_at ASC
    `;

    const facts = { status: vendor.status, capacity: entitlement.vendorSlots };
    return {
      vendorId: vendor.id,
      status: vendor.status,
      tier: entitlement.tierName,
      capacity: entitlement.vendorSlots,
      held: rows.length,
      usable: usableSlots(facts, { open: rows.length }),
      slots: rows.map(toSlot),
    };
  }
}
