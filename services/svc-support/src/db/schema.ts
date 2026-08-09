import { index, integer, jsonb, pgSchema, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, pk } from '@intafaced/db';

/**
 * svc-support schema — tickets, comments, audit trail, case files.
 *
 * Doctrine §2: this schema is the only one this service may touch.
 * No balances, no money columns, no cross-service table reads.
 *
 * Account state is NOT a table here and must never become one. It is read per
 * request from svc-identity (`src/account-state.ts`); a `support.accounts`
 * projection would be a second source of truth for whether an account is
 * frozen, and an operator reassuring a user from a stale copy is the failure it
 * would cause.
 */

export const schema = pgSchema('support');

export const tickets = schema.table('tickets', {
  id: pk(),
  userId: text('user_id').notNull(),
  category: text('category').notNull(),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  status: text('status').$type<'open' | 'pending' | 'resolved' | 'closed'>().notNull().default('open'),
  assigneeId: text('assignee_id'),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const comments = schema.table('comments', {
  id: pk(),
  ticketId: uuid('ticket_id')
    .notNull()
    .references(() => tickets.id, { onDelete: 'cascade' }),
  authorId: text('author_id').notNull(),
  authorRole: text('author_role').$type<'user' | 'operator'>().notNull(),
  body: text('body').notNull(),
  createdAt: createdAt(),
});

/**
 * The audit trail. Append-only — enforced by a trigger in migration 0001,
 * because a history TypeScript alone protects is a history a psql session can
 * rewrite.
 */
export const ticketEvents = schema.table(
  'ticket_events',
  {
    id: pk(),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    /** 1-based, dense per ticket. The gap is the evidence a row was lost. */
    sequence: integer('sequence').notNull(),
    kind: text('kind').$type<'opened' | 'assigned' | 'status_changed' | 'grounding_read' | 'escalated'>().notNull(),
    actorId: text('actor_id').notNull(),
    actorRole: text('actor_role').$type<'user' | 'operator'>().notNull(),
    fromStatus: text('from_status').$type<'open' | 'pending' | 'resolved' | 'closed'>(),
    toStatus: text('to_status').$type<'open' | 'pending' | 'resolved' | 'closed'>(),
    note: text('note'),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    /** Dense per ticket, and the anti-loss constraint — not a lookup aid. */
    uniqueIndex('ticket_events_ticket_sequence_idx').on(t.ticketId, t.sequence),
    index('ticket_events_ticket_occurred_idx').on(t.ticketId, t.occurredAt),
  ],
);

/**
 * The context an escalation carries. Immutable once written (trigger, 0001):
 * the record's whole value is that it says what was read at the moment the
 * decision was made, and a mutable one can be brought into line with the
 * outcome afterwards.
 *
 * NO AMOUNT COLUMN, deliberately. `reason` may be `money_request` — support
 * files the request and the pay/ledger recipe moves the value (§0.6).
 */
export const caseFiles = schema.table('case_files', {
  id: pk(),
  ticketId: uuid('ticket_id')
    .notNull()
    .references(() => tickets.id, { onDelete: 'cascade' }),
  escalatedBy: text('escalated_by').notNull(),
  reason: text('reason').$type<'account_state' | 'kyc_review' | 'money_request' | 'technical' | 'other'>().notNull(),
  /** `{kind, ref, digest, readAt}[]` — proof of what was read, never a copy. */
  citations: jsonb('citations').notNull(),
  /** Account projection as read, or an explicit "never read, here is why". */
  grounding: jsonb('grounding').notNull(),
  summary: text('summary').notNull(),
  createdAt: createdAt(),
});

export type TicketRow = typeof tickets.$inferSelect;
export type CommentRow = typeof comments.$inferSelect;
export type TicketEventRow = typeof ticketEvents.$inferSelect;
export type CaseFileRow = typeof caseFiles.$inferSelect;
