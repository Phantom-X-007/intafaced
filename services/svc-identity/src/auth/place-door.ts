import type { Sql } from 'postgres';
import { apiKeyExpired } from './expire-api-key.js';
import { sessionExpired } from './expire-session.js';

/**
 * PLACE DOOR for one API key or one session.
 *
 * After the user revokes either credential it cannot place, and its private
 * stream/COD must not keep firing as live. Fail-closed:
 *   - missing / empty / unknown id → denied (no existence oracle)
 *   - revoked (session also: expired) → revoked
 *   - API key past expiresAt → revoked (no invented clock; uses the stored instant)
 *   - session past expiresAt → revoked (no invented clock; uses the stored instant)
 *
 * Ownership snapshots are { id, userId, revoked } only — no scopes, no
 * jurisdiction, no flatten.
 */
export class PlaceDoorError extends Error {
  constructor(
    message: string,
    readonly code: 'auth.api_key_denied' | 'auth.api_key_revoked' | 'auth.session_denied' | 'auth.session_revoked',
  ) {
    super(message);
    this.name = 'PlaceDoorError';
  }
}

export class PlaceDoor {
  constructor(private readonly sql: Sql) {}

  async getApiKeyOwnership(keyId: string): Promise<{ id: string; userId: string; revoked: boolean } | null> {
    const rows = await this.sql<Array<{ id: string; user_id: string; revoked: boolean; expires_at: Date | null }>>`
      SELECT id, user_id, revoked, expires_at
        FROM api_keys
       WHERE id = ${keyId}
       LIMIT 1
    `;
    const row = rows[0];
    if (!row) return null;
    return { id: row.id, userId: row.user_id, revoked: row.revoked || apiKeyExpired(row.expires_at) };
  }

  async assertApiKeyLive(keyId: string): Promise<{ id: string; userId: string }> {
    const id = typeof keyId === 'string' ? keyId.trim() : '';
    if (!id) {
      throw new PlaceDoorError('API key not found', 'auth.api_key_denied');
    }
    const row = await this.getApiKeyOwnership(id);
    if (!row) {
      throw new PlaceDoorError('API key not found', 'auth.api_key_denied');
    }
    if (row.revoked) {
      throw new PlaceDoorError('API key is revoked', 'auth.api_key_revoked');
    }
    return { id: row.id, userId: row.userId };
  }

  async getSessionOwnership(sessionId: string): Promise<{ id: string; userId: string; revoked: boolean } | null> {
    const rows = await this.sql<Array<{ id: string; user_id: string; revoked: boolean; expires_at: Date | null }>>`
      SELECT id, user_id, revoked, expires_at
        FROM sessions
       WHERE id = ${sessionId}
       LIMIT 1
    `;
    const row = rows[0];
    if (!row) return null;
    return { id: row.id, userId: row.user_id, revoked: row.revoked || sessionExpired(row.expires_at) };
  }

  async assertSessionLive(sessionId: string): Promise<{ id: string; userId: string }> {
    const id = typeof sessionId === 'string' ? sessionId.trim() : '';
    if (!id) {
      throw new PlaceDoorError('Session not found', 'auth.session_denied');
    }
    const row = await this.getSessionOwnership(id);
    if (!row) {
      throw new PlaceDoorError('Session not found', 'auth.session_denied');
    }
    if (row.revoked) {
      throw new PlaceDoorError('Session is revoked', 'auth.session_revoked');
    }
    return { id: row.id, userId: row.userId };
  }
}
