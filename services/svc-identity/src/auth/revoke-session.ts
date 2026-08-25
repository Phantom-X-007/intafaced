/**
 * Revoke one session by id. Same UPDATE as AuthService refresh/logout-by-id.
 * Already-revoked stay revoked. Foreign user is a no-op.
 * Named-user write door: own seat only, missing ids refuse-closed.
 */
import type { Sql } from 'postgres';
import { requireUserId } from './revoke-all-api-keys.js';

export class RevokeSessionError extends Error {
  constructor(
    message: string,
    readonly code: 'auth.user_id_missing' | 'auth.session_id_missing',
  ) {
    super(message);
    this.name = 'RevokeSessionError';
  }
}

export function requireRevokeSessionIds(
  userId: string | null | undefined,
  sessionId: string | null | undefined,
): { userId: string; sessionId: string } {
  let named: string;
  try {
    named = requireUserId(userId);
  } catch {
    throw new RevokeSessionError('userId is required', 'auth.user_id_missing');
  }
  if (sessionId === null || sessionId === undefined) {
    throw new RevokeSessionError('sessionId is required', 'auth.session_id_missing');
  }
  if (typeof sessionId === 'string' && sessionId.trim() === '') {
    throw new RevokeSessionError('sessionId is required', 'auth.session_id_missing');
  }
  return { userId: named, sessionId: sessionId.trim() };
}

export async function revokeSession(sql: Sql, userId: string, sessionId: string): Promise<boolean> {
  const rows = await sql<Array<{ id: string }>>`
    UPDATE sessions
    SET revoked = true
    WHERE id = ${sessionId} AND user_id = ${userId} AND revoked = false
    RETURNING id
  `;
  return rows.length > 0;
}

export async function revokeNamedSession(
  sql: Sql,
  principalUserId: string | null | undefined,
  namedUserId: string | null | undefined,
  sessionId: string | null | undefined,
): Promise<{ userId: string; sessionId: string; revoked: boolean }> {
  const named = requireRevokeSessionIds(namedUserId, sessionId);
  const principal = requireRevokeSessionIds(principalUserId, sessionId);
  if (named.userId !== principal.userId) {
    return { userId: named.userId, sessionId: named.sessionId, revoked: false };
  }
  const revoked = await revokeSession(sql, named.userId, named.sessionId);
  return { userId: named.userId, sessionId: named.sessionId, revoked };
}
