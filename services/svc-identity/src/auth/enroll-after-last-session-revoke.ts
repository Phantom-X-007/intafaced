/**
 * Revoke a live session only after the newly enrolled passkey verifies following a last-unenroll.
 * Refuse if none remain. Reuses requireVerifiedPasskey and revokeSession. No invented challenge.
 */
import type { Sql } from 'postgres';
import { MintApiKeyPasskeyError, requireVerifiedPasskey } from './mint-api-key-passkey.js';
import { revokeSession } from './revoke-session.js';

export function newlyEnrolledPasskeyRevokesSession(raw: unknown): void {
  requireVerifiedPasskey(raw);
}

export async function revokeSessionAfterNewlyEnrolledPasskey(
  sql: Sql,
  input: { userId: string; sessionId: string },
): Promise<{ revokedSessionId: string }> {
  const rows = await sql<Array<{ webauthn_creds: unknown }>>`
    SELECT webauthn_creds FROM users WHERE id = ${input.userId} LIMIT 1
  `;
  const user = rows[0];
  if (!user) throw new MintApiKeyPasskeyError('User not found', 'auth.not_found');
  requireVerifiedPasskey(user.webauthn_creds);
  const revoked = await revokeSession(sql, input.userId, input.sessionId);
  if (!revoked) throw new MintApiKeyPasskeyError('Session not found', 'auth.not_found');
  return { revokedSessionId: input.sessionId };
}
