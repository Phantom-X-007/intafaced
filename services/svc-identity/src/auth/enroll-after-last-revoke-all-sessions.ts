/**
 * Revoke all live sessions only after the newly enrolled passkey verifies following a last-unenroll.
 * Refuse if none remain. Reuses requireVerifiedPasskey and revokeAllSessions.
 * No invented challenge. Not a redo of one-session revoke.
 */
import type { Sql } from 'postgres';
import { MintApiKeyPasskeyError, requireVerifiedPasskey } from './mint-api-key-passkey.js';
import { revokeAllSessions } from './revoke-all-sessions.js';

export function newlyEnrolledPasskeyRevokesAllSessions(raw: unknown): void {
  requireVerifiedPasskey(raw);
}

export async function revokeAllSessionsAfterNewlyEnrolledPasskey(
  sql: Sql,
  input: { userId: string },
): Promise<{ userId: string; revoked: number }> {
  const rows = await sql<Array<{ webauthn_creds: unknown }>>`
    SELECT webauthn_creds FROM users WHERE id = ${input.userId} LIMIT 1
  `;
  const user = rows[0];
  if (!user) throw new MintApiKeyPasskeyError('User not found', 'auth.not_found');
  requireVerifiedPasskey(user.webauthn_creds);
  return revokeAllSessions(sql, input.userId, input.userId);
}
