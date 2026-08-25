/**
 * Expire an API key at the given expiresAt. After that instant it cannot place.
 * Refuse if expiresAt is missing. No invented clock — never default to now.
 */
import type { Sql } from 'postgres';

export class ExpireApiKeyError extends Error {
  constructor(
    message: string,
    readonly code: 'auth.expires_at_missing' | 'auth.not_found',
  ) {
    super(message);
    this.name = 'ExpireApiKeyError';
  }
}

export function requireExpiresAt(value: Date | string | null | undefined): Date {
  if (value === null || value === undefined) {
    throw new ExpireApiKeyError('expiresAt is required', 'auth.expires_at_missing');
  }
  if (typeof value === 'string' && value.trim() === '') {
    throw new ExpireApiKeyError('expiresAt is required', 'auth.expires_at_missing');
  }
  const at = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(at.getTime())) {
    throw new ExpireApiKeyError('expiresAt is required', 'auth.expires_at_missing');
  }
  return at;
}

/** After expiresAt the key cannot place. Missing expiry stays open. */
export function apiKeyExpired(expiresAt: Date | null | undefined): boolean {
  if (!expiresAt) return false;
  return expiresAt.getTime() < Date.now();
}

export async function expireApiKey(
  sql: Sql,
  userId: string,
  keyId: string,
  expiresAt: Date | string | null | undefined,
): Promise<{ id: string; expiresAt: Date }> {
  const at = requireExpiresAt(expiresAt);
  const rows = await sql<Array<{ id: string; expires_at: Date }>>`
    UPDATE api_keys
    SET expires_at = ${at}
    WHERE id = ${keyId} AND user_id = ${userId} AND revoked = false
    RETURNING id, expires_at
  `;
  const row = rows[0];
  if (!row) throw new ExpireApiKeyError('API key not found', 'auth.not_found');
  return { id: row.id, expiresAt: row.expires_at };
}
