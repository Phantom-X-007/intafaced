/**
 * List live sessions for one named user. Operator before/after panic.
 * Live = revoked false. Missing userId refuses. Limit required — omit never dumps seats.
 * No other user. No secrets.
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

/** Blank / non-integer / out of 1..200 live-seats window. Never invent a page size. */
export const IDENTITY_SESSIONS_LIST_LIMIT_UNSET = 'identity.sessions_list_limit_unset' as const;
export const SESSIONS_LIST_LIMIT_MAX = 200;

export class SessionsListLimitUnsetError extends Error {
  constructor(
    message: string,
    readonly code: typeof IDENTITY_SESSIONS_LIST_LIMIT_UNSET,
  ) {
    super(message);
    this.name = 'SessionsListLimitUnsetError';
  }
}

/** Owner-published live-seats window. Missing / null / non-int / out of 1..max refuses. */
export function publishedSessionsListLimit(value: number | undefined | null): number {
  if (value === undefined || value === null || !Number.isInteger(value) || value < 1 || value > SESSIONS_LIST_LIMIT_MAX) {
    throw new SessionsListLimitUnsetError('Sessions list limit is unset — refuse to dump live seats', IDENTITY_SESSIONS_LIST_LIMIT_UNSET);
  }
  return value;
}

export function requireListSessionsUserId(value: string | null | undefined): string {
  try {
    return requireUserId(value);
  } catch {
    throw new ListSessionsError('userId is required', 'auth.user_id_missing');
  }
}

export async function listSessions(
  sql: Sql,
  namedUserId: string | null | undefined,
  limit: number,
): Promise<{ userId: string; sessions: LiveSession[] }> {
  const named = requireListSessionsUserId(namedUserId);
  const published = publishedSessionsListLimit(limit);
  const rows = await sql<Array<{ id: string; created_at: Date; revoked: boolean }>>`
    SELECT id, created_at, revoked
    FROM sessions
    WHERE user_id = ${named} AND revoked = false
    ORDER BY created_at DESC
    LIMIT ${published}
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
