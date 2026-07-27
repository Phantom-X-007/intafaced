import { customType, numeric, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Shared column types.
 *
 * Every service defines its own schema, but they all use these primitives so a
 * timestamp means the same thing in svc-pay as in svc-ledger, and so money is
 * physically incapable of being stored as a float.
 */

/** Primary key: `id uuid primary key default gen_random_uuid()`. */
export const pk = () => uuid('id').primaryKey().defaultRandom();

/** Timestamps are always tz-aware and always UTC. A naive timestamp is a bug. */
export const createdAt = () => timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow();
export const updatedAt = () => timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow();
export const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/**
 * MONEY. numeric(38,18), surfaced to TypeScript as a decimal *string*.
 *
 * Drizzle's default numeric mapping hands back a string already; this alias
 * exists so `amount()` is the only thing anyone types, and so a future change
 * of representation (bigint columns, say) happens in one place.
 *
 * Parse with `parseAmount` from @intafaced/ledger-client before doing maths.
 * Never with `Number()`.
 */
export const amount = (name: string) => numeric(name, { precision: 38, scale: 18 });

/** citext — case-insensitive text, for handles and emails (§4.1). */
export const citext = customType<{ data: string; driverData: string }>({
  dataType: () => 'citext',
});

/** Basis points, stored as a plain integer. 10000 bps = 100%. */
export const bps = (name: string) => numeric(name, { precision: 8, scale: 0 });
