/**
 * Revoke an API key only after the newly enrolled passkey verifies following a last-unenroll.
 * Refuse if none remain. Reuses requireVerifiedPasskey. No invented challenge.
 */
import type { Sql } from 'postgres';
import type { ApiKeyMinter } from './mint-api-key-ip.js';
import { MintApiKeyPasskeyError, requireVerifiedPasskey } from './mint-api-key-passkey.js';

export function newlyEnrolledPasskeyRevokes(raw: unknown): void {
  requireVerifiedPasskey(raw);
}

export async function revokeApiKeyAfterNewlyEnrolledPasskey(
  minter: ApiKeyMinter,
  sql: Sql,
  input: { userId: string; keyId: string },
): Promise<{ revokedKeyId: string }> {
  const rows = await sql<Array<{ webauthn_creds: unknown }>>`
    SELECT webauthn_creds FROM users WHERE id = ${input.userId} LIMIT 1
  `;
  const user = rows[0];
  if (!user) throw new MintApiKeyPasskeyError('User not found', 'auth.not_found');
  requireVerifiedPasskey(user.webauthn_creds);
  const revoked = await minter.revokeApiKey(input.userId, input.keyId);
  if (!revoked) throw new MintApiKeyPasskeyError('API key not found', 'auth.not_found');
  return { revokedKeyId: input.keyId };
}
