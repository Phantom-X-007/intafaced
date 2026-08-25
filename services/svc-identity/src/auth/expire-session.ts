/**
 * Expire a session at the given expiresAt. After that instant it cannot place.
 * Refuse if expiresAt is missing. No invented clock — never default to now.
 */
import type { Sql } from 'postgres';

export class ExpireSessionError extends Error {
  constructor(
    message: string,
    readonly code: 'auth.expires_at_missing' | 'auth.not_found',
  ) {
    super(message);
    this.name = 'ExpireSessionError';
  }
}

export function requireSessionExpiresAt(value: Date | string | null | undefined): Date {
  if (value === null || value === undefined) {
    throw new ExpireSessionError('expiresAt is required', 'auth.expires_at_missing');
  }
  if (typeof value === 'string' && value.trim() === '') {
    throw new ExpireSessionError('expiresAt is required', 'auth.expires_at_missing');
  }
  const at = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(at.getTime())) {
    throw new ExpireSessionError('expiresAt is required', 'auth.expires_at_missing');
  }
  return at;
}

/** After expiresAt the session cannot place. Missing expiry stays open. */
export function sessionExpired(expiresAt: Date | null | undefined): boolean {
  if (!expiresAt) return false;
  return expiresAt.getTime() < Date.now();
}

export async function expireSession(
  sql: Sql,
  userId: string,
  sessionId: string,
  expiresAt: Date | string | null | undefined,
): Promise<{ id: string; expiresAt: Date }> {
  const at = requireSessionExpiresAt(expiresAt);
  const rows = await sql<Array<{ id: string; expires_at: Date }>>`
    UPDATE sessions
    SET expires_at = ${at}
    WHERE id = ${sessionId} AND user_id = ${userId} AND revoked = false
    RETURNING id, expires_at
  `;
  const row = rows[0];
  if (!row) throw new ExpireSessionError('Session not found', 'auth.not_found');
  return { id: row.id, expiresAt: row.expires_at };
}
