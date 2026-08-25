/**
 * List live sessions for one named user. Operator before/after panic.
 * Live = revoked false. Missing userId refuses. No other user. No secrets.
 */
import type { Sql } from 'postgres';
import { requireUserId } from './revoke-all-api-keys.js';

export type LiveSession = {
  id: string;
  createdAt: Date;
  revoked: false;
};

export class ListSessionsError extends Error {
  constructor(
    message: string,
    readonly code: 'auth.user_id_missing',
  ) {
    super(message);
    this.name = 'ListSessionsError';
  }
}

export function requireListSessionsUserId(value: string | null | undefined): string {
  try {
    return requireUserId(value);
  } catch {
    throw new ListSessionsError('userId is required', 'auth.user_id_missing');
  }
}

export async function listSessions(sql: Sql, namedUserId: string | null | undefined): Promise<{ userId: string; sessions: LiveSession[] }> {
  const named = requireListSessionsUserId(namedUserId);
  const rows = await sql<Array<{ id: string; created_at: Date; revoked: boolean }>>`
    SELECT id, created_at, revoked
    FROM sessions
    WHERE user_id = ${named} AND revoked = false
    ORDER BY created_at DESC
  `;
  return {
    userId: named,
    sessions: rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      revoked: false as const,
    })),
  };
}
