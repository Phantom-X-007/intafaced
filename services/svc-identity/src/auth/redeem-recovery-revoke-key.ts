/**
 * Revoke an API key only from the recovered session after a recovery redeem.
 * Refuse if the code is spent or missing. Reuses hashToken and PlaceDoor.assertSessionLive.
 * Not a redo of revoke-all-keys or recovery-rotate.
 */
import type { Sql } from 'postgres';
import type { ApiKeyMinter } from './mint-api-key-ip.js';
import { PlaceDoor } from './place-door.js';
import { hashToken } from './passwords.js';

export class RedeemRecoveryRevokeKeyError extends Error {
  constructor(
    message: string,
    readonly code: 'auth.recovery_missing' | 'auth.recovery_spent' | 'auth.recovery_invalid' | 'auth.not_found',
  ) {
    super(message);
    this.name = 'RedeemRecoveryRevokeKeyError';
  }
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

export function recoveryCodeRevokesApiKey(code: unknown): void {
  const trimmed = typeof code === 'string' ? code.trim() : '';
  if (!trimmed) {
    throw new RedeemRecoveryRevokeKeyError('Recovery code missing', 'auth.recovery_missing');
  }
}

export async function revokeApiKeyAfterRecoveryCode(
  minter: ApiKeyMinter,
  sql: Sql,
  input: { userId: string; sessionId: string; keyId: string; code: string },
): Promise<{ revokedKeyId: string; sessionId: string }> {
  recoveryCodeRevokesApiKey(input.code);
  const rows = await sql<Array<{ recovery_code_hashes: unknown }>>`
    SELECT recovery_code_hashes FROM users WHERE id = ${input.userId} LIMIT 1
  `;
  const user = rows[0];
  if (!user) throw new RedeemRecoveryRevokeKeyError('User not found', 'auth.not_found');
  const hashes = asStringList(user.recovery_code_hashes);
  if (hashes.length === 0) {
    throw new RedeemRecoveryRevokeKeyError('Recovery code spent', 'auth.recovery_spent');
  }
  const hash = hashToken(input.code.trim());
  const idx = hashes.indexOf(hash);
  if (idx < 0) {
    throw new RedeemRecoveryRevokeKeyError('Recovery code invalid', 'auth.recovery_invalid');
  }
  const live = await new PlaceDoor(sql).assertSessionLive(input.sessionId);
  const revoked = await minter.revokeApiKey(input.userId, input.keyId);
  if (!revoked) throw new RedeemRecoveryRevokeKeyError('API key not found', 'auth.not_found');
  const next = hashes.slice(0, idx).concat(hashes.slice(idx + 1));
  await sql`
    UPDATE users
       SET recovery_code_hashes = ${sql.json(next as never)}, updated_at = now()
     WHERE id = ${input.userId}
  `;
  return { revokedKeyId: input.keyId, sessionId: live.id };
}
