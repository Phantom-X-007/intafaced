import { pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { createdAt, pk } from '@intafaced/db';

/**
 * svc-support schema — tickets + comments only.
 *
 * Doctrine §2: this schema is the only one this service may touch.
 * No balances, no money columns, no cross-service table reads.
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

export type TicketRow = typeof tickets.$inferSelect;
export type CommentRow = typeof comments.$inferSelect;
