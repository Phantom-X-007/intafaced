/**
 * Rotate an API key only from the recovered session after a recovery redeem.
 * The old key cannot place. Refuse if the code is spent or missing.
 * Reuses hashToken, PlaceDoor.assertSessionLive, and rotateApiKey.
 * Not a redo of recovery-mint.
 */
import type { Sql } from 'postgres';
import type { ApiKeyMinter } from './mint-api-key-ip.js';
import { PlaceDoor } from './place-door.js';
import { hashToken } from './passwords.js';
import { rotateApiKey } from './rotate-api-key.js';

export class RedeemRecoveryRotateError extends Error {
  constructor(
    message: string,
    readonly code: 'auth.recovery_missing' | 'auth.recovery_spent' | 'auth.recovery_invalid' | 'auth.not_found',
  ) {
    super(message);
    this.name = 'RedeemRecoveryRotateError';
  }
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

export function recoveryCodeRotatesApiKey(code: unknown): void {
  const trimmed = typeof code === 'string' ? code.trim() : '';
  if (!trimmed) {
    throw new RedeemRecoveryRotateError('Recovery code missing', 'auth.recovery_missing');
  }
}

export async function rotateApiKeyAfterRecoveryCode(
  minter: ApiKeyMinter,
  sql: Sql,
  input: { userId: string; sessionId: string; keyId: string; code: string; grantorScopes: readonly string[]; grantorKid?: string | null },
): Promise<{ id: string; key: string; prefix: string; mode: 'live' | 'sandbox'; revokedKeyId: string; sessionId: string }> {
  recoveryCodeRotatesApiKey(input.code);
  const rows = await sql<Array<{ recovery_code_hashes: unknown }>>`
    SELECT recovery_code_hashes FROM users WHERE id = ${input.userId} LIMIT 1
  `;
  const user = rows[0];
  if (!user) throw new RedeemRecoveryRotateError('User not found', 'auth.not_found');
  const hashes = asStringList(user.recovery_code_hashes);
  if (hashes.length === 0) {
    throw new RedeemRecoveryRotateError('Recovery code spent', 'auth.recovery_spent');
  }
  const hash = hashToken(input.code.trim());
  const idx = hashes.indexOf(hash);
  if (idx < 0) {
    throw new RedeemRecoveryRotateError('Recovery code invalid', 'auth.recovery_invalid');
  }
  const live = await new PlaceDoor(sql).assertSessionLive(input.sessionId);
  const rotated = await rotateApiKey(minter, sql, {
    userId: input.userId,
    keyId: input.keyId,
    grantorScopes: input.grantorScopes,
    grantorKid: input.grantorKid,
  });
  const next = hashes.slice(0, idx).concat(hashes.slice(idx + 1));
  await sql`
    UPDATE users
       SET recovery_code_hashes = ${sql.json(next as never)}, updated_at = now()
     WHERE id = ${input.userId}
  `;
  return { ...rotated, sessionId: live.id };
}
