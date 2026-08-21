import { bigserial, index, integer, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt } from '@intafaced/db';
import { kybStatusEnum, merchants, pay } from './schema.js';

/**
 * DIGITAL KYB + CUSTOM PRICING HISTORY (`pay.psp`) — declarative mirrors of
 * migration `0013_pay_merchant_kyb_history.sql`.
 *
 * Kept out of `schema.ts` for the same dual-edit reason as `merchant-state.ts`:
 * partner PRs hold that file; these tables belong beside `merchants` later.
 */

export const merchantKybEvents = pay.table(
  'merchant_kyb_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    seq: bigserial('seq', { mode: 'bigint' }).notNull(),
    merchantId: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id),
    fromStatus: kybStatusEnum('from_status').notNull(),
    toStatus: kybStatusEnum('to_status').notNull(),
    kybRef: text('kyb_ref'),
    reason: text('reason').notNull(),
    actorId: text('actor_id').notNull(),
    actorScope: text('actor_scope').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('merchant_kyb_events_seq_idx').on(t.seq), index('merchant_kyb_events_merchant_idx').on(t.merchantId, t.seq)],
);

export const merchantPricingEvents = pay.table(
  'merchant_pricing_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    seq: bigserial('seq', { mode: 'bigint' }).notNull(),
    merchantId: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id),
    fromFeeBps: integer('from_fee_bps').notNull(),
    toFeeBps: integer('to_fee_bps').notNull(),
    reason: text('reason').notNull(),
    actorId: text('actor_id').notNull(),
    actorScope: text('actor_scope').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('merchant_pricing_events_seq_idx').on(t.seq), index('merchant_pricing_events_merchant_idx').on(t.merchantId, t.seq)],
);
