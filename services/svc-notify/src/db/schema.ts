import { jsonb, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { createdAt, pk } from '@intafaced/db';

/**
 * svc-notify schema — in-app inbox only.
 *
 * Doctrine §2: this schema is the only one this service may touch. No balances,
 * no money columns, no references into another service's tables.
 */

export const schema = pgSchema('notify');

export const notifications = schema.table('notifications', {
  id: pk(),
  userId: text('user_id').notNull(),
  kind: text('kind').notNull(),
  titleKey: text('title_key').notNull(),
  bodyKey: text('body_key').notNull(),
  params: jsonb('params').$type<Record<string, unknown>>().notNull().default({}),
  href: text('href'),
  severity: text('severity').$type<'info' | 'action' | 'critical'>().notNull().default('info'),
  readAt: timestamp('read_at', { withTimezone: true, mode: 'date' }),
  sourceSubject: text('source_subject').notNull(),
  sourceIdempotencyKey: text('source_idempotency_key').notNull(),
  createdAt: createdAt(),
});

export type NotificationRow = typeof notifications.$inferSelect;
