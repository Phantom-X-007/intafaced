/**
 * Revoke every live session for one named user. Compromise kill switch.
 * Reuses revokeSession per live seat. Already-revoked stay revoked.
 * Missing userId refuses. No other user.
 */
import type { Sql } from 'postgres';
import { requireUserId } from './revoke-all-api-keys.js';
import { revokeSession } from './revoke-session.js';

export class RevokeAllSessionsError extends Error {
  constructor(
    message: string,
    readonly code: 'auth.user_id_missing',
  ) {
    super(message);
    this.name = 'RevokeAllSessionsError';
  }
}

export function requireSessionUserId(value: string | null | undefined): string {
  try {
    return requireUserId(value);
  } catch {
    throw new RevokeAllSessionsError('userId is required', 'auth.user_id_missing');
  }
}

export async function revokeAllSessions(
  sql: Sql,
  principalUserId: string | null | undefined,
  namedUserId: string | null | undefined,
): Promise<{ userId: string; revoked: number }> {
  const named = requireSessionUserId(namedUserId);
  const principal = requireSessionUserId(principalUserId);
  if (named !== principal) {
    return { userId: named, revoked: 0 };
  }
  const live = await sql<Array<{ id: string }>>`
    SELECT id
    FROM sessions
    WHERE user_id = ${named} AND revoked = false
  `;
  let revoked = 0;
  for (const row of live) {
    if (await revokeSession(sql, named, row.id)) revoked += 1;
  }
  return { userId: named, revoked };
}
