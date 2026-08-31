/**
 * Revoke all API keys only after the newly enrolled passkey verifies following a last-unenroll.
 * Refuse if none remain. Reuses requireVerifiedPasskey and revokeAllApiKeys.
 * No invented challenge. Not a redo of one-key revoke.
 */
import type { Sql } from 'postgres';
import { MintApiKeyPasskeyError, requireVerifiedPasskey } from './mint-api-key-passkey.js';
import { revokeAllApiKeys } from './revoke-all-api-keys.js';

export function newlyEnrolledPasskeyRevokesAllKeys(raw: unknown): void {
  requireVerifiedPasskey(raw);
}

export async function revokeAllApiKeysAfterNewlyEnrolledPasskey(
  sql: Sql,
  input: { userId: string },
): Promise<{ userId: string; revoked: number }> {
  const rows = await sql<Array<{ webauthn_creds: unknown }>>`
    SELECT webauthn_creds FROM users WHERE id = ${input.userId} LIMIT 1
  `;
  const user = rows[0];
  if (!user) throw new MintApiKeyPasskeyError('User not found', 'auth.not_found');
  requireVerifiedPasskey(user.webauthn_creds);
  return revokeAllApiKeys(sql, input.userId, input.userId);
}
