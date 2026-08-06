import { bigserial, index, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt } from '@intafaced/db';
import { merchantStatusEnum, merchants, pay } from './schema.js';

/**
 * MERCHANT STATE HISTORY (§6.1) — the declarative mirror of migration
 * `0006_pay_merchant_status_history.sql`.
 *
 * ── WHY IT IS IN ITS OWN FILE AND NOT IN `schema.ts` ────────────────────────
 *
 * Only because `src/db/schema.ts` is held by open PR #346, and dual-editing a
 * partner's file is how two branches both end up unmergeable. This table
 * BELONGS in `schema.ts` beside `merchants`, and folding it in is the first
 * thing to do after #346 lands — along with adding it to the `schema` barrel
 * there, which this file deliberately does not fork a second copy of.
 *
 * ── WHAT IT RECORDS, AND WHAT IT REFUSES TO DECIDE ─────────────────────────
 *
 * `docs/adr/2026-08-04-pay-rails-and-psp-socket.md` (Accepted): *"Merchant state
 * has no history and no writer. `status='suspended'` is read and enforced by a
 * code path that nothing writes… a suspension cannot be explained, dated, or
 * undone."*
 *
 * This closes the recording half and NOT the deciding half. There is no policy
 * here: no threshold, no automatic transition, no rule about when a merchant
 * ought to be suspended. Recording who, when and why is not deciding when, and
 * the second is product law that belongs to the owner.
 */
export const merchantStatusEvents = pay.table(
  'merchant_status_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /**
     * Ordering, and the reason it is not `created_at`.
     *
     * `now()` inside a transaction is the TRANSACTION'S start time, so two
     * transitions written by one statement share a timestamp and cannot be
     * ordered by it. `payment_events` carries a `seq` for exactly this and this
     * table has the same problem.
     */
    seq: bigserial('seq', { mode: 'bigint' }).notNull(),

    merchantId: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id),

    /**
     * BOTH SIDES OF THE TRANSITION.
     *
     * `to_status` alone makes every row depend on reading the previous one, and
     * makes the FIRST row unreadable — there is nothing before it to compare
     * against. With both, one row answers "what happened" on its own and a gap
     * in the chain is detectable instead of invisible.
     */
    fromStatus: merchantStatusEnum('from_status').notNull(),
    toStatus: merchantStatusEnum('to_status').notNull(),

    /**
     * REQUIRED, and free text.
     *
     * The ADR's test is "an operator cannot answer 'why is this merchant
     * suspended' from the database". A nullable reason fails that on the first
     * row somebody is in a hurry for; an enum of reasons fails it differently,
     * by forcing every real situation into whichever of five codes is least
     * wrong. The database also refuses a blank string — see the CHECK in the
     * migration, which is where "required" is actually enforced.
     */
    reason: text('reason').notNull(),

    /** The authenticated operator. Never a request-body field. */
    actorId: text('actor_id').notNull(),

    /**
     * The scope the caller actually held, recorded because scope law moves.
     * "This was done under admin:write in August" is a different fact from
     * "whoever did this would need admin:write today".
     */
    actorScope: text('actor_scope').notNull(),

    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('merchant_status_events_seq_idx').on(t.seq), index('merchant_status_events_merchant_idx').on(t.merchantId, t.seq)],
);
