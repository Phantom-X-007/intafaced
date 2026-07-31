import type postgres from 'postgres';

/**
 * svc-identity's half of the blueprint cascade (§7.2).
 *
 * svc-blueprint owns Blueprint rows and publishes `blueprintCreated` /
 * `blueprintDeleted`. It must never write `profiles` (§2). We set and
 * clear `profiles.blueprint_id` here so export/erase truly cascades.
 *
 * Pure SQL helpers — the bus wiring lives in `events.ts` so tests can drive
 * the same mutations without NATS.
 */

export type Sql = postgres.Sql;

/** Link the caller's profile to a newly created Blueprint. */
export async function applyBlueprintCreated(sql: Sql, input: { userId: string; blueprintId: string }): Promise<{ updated: boolean }> {
  const rows = await sql`
    UPDATE profiles
       SET blueprint_id = ${input.blueprintId}
     WHERE user_id = ${input.userId}
 RETURNING user_id
  `;
  return { updated: rows.length > 0 };
}

/**
 * Clear the pointer after hard erase.
 *
 * Only clears when the row still points at the deleted blueprint id. A
 * redelivered delete must not wipe a newer blueprint the user onboarded after
 * the erase (catalog: idempotent on user; safe under at-least-once).
 */
export async function applyBlueprintDeleted(sql: Sql, input: { userId: string; blueprintId: string }): Promise<{ cleared: boolean }> {
  const rows = await sql`
    UPDATE profiles
       SET blueprint_id = NULL
     WHERE user_id = ${input.userId}
       AND blueprint_id = ${input.blueprintId}
 RETURNING user_id
  `;
  return { cleared: rows.length > 0 };
}

export async function readBlueprintId(sql: Sql, userId: string): Promise<string | null> {
  const rows = await sql<Array<{ blueprint_id: string | null }>>`
    SELECT blueprint_id FROM profiles WHERE user_id = ${userId}
  `;
  return rows[0]?.blueprint_id ?? null;
}
