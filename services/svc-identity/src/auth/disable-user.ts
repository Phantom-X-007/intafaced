/**
 * Disable one named user. Safety door: that user cannot mint or exchange keys.
 * Reuses users.status (frozen) — no second column. Revokes their live keys.
 * Does not freeze any other user. Does not invent keys on a later unfreeze.
 */
import type { Sql } from 'postgres';
import { AuthError, type AuthService } from './auth-service.js';
import { requireUserId } from './revoke-all-api-keys.js';
import { DUAL_CONTROL_MISSING, type DualControlCmd } from './four-eyes.js';
import { PrivilegedDualControlError, requirePrivilegedDualControl } from './privileged-dual-control.js';

export class DisableUserError extends Error {
  constructor(
    message: string,
    readonly code: 'auth.user_id_missing' | 'auth.not_found' | typeof DUAL_CONTROL_MISSING,
  ) {
    super(message);
    this.name = 'DisableUserError';
  }
}

export function requireDisableUserId(value: string | null | undefined): string {
  try {
    return requireUserId(value);
  } catch {
    throw new DisableUserError('userId is required', 'auth.user_id_missing');
  }
}

export async function disableUser(
  sql: Sql,
  namedUserId: string | null | undefined,
  cmd: DualControlCmd,
): Promise<{ userId: string; status: 'frozen'; keysRevoked: number }> {
  const named = requireDisableUserId(namedUserId);
  try {
    requirePrivilegedDualControl(cmd);
  } catch (err) {
    if (err instanceof PrivilegedDualControlError) {
      throw new DisableUserError(err.message, err.code);
    }
    throw err;
  }
  const users = await sql<Array<{ id: string }>>`
    SELECT id FROM users WHERE id = ${named} LIMIT 1
  `;
  if (!users[0]) {
    throw new DisableUserError('User not found', 'auth.not_found');
  }
  await sql`
    UPDATE users SET status = 'frozen', updated_at = now() WHERE id = ${named}
  `;
  const rows = await sql<Array<{ id: string }>>`
    UPDATE api_keys
    SET revoked = true
    WHERE user_id = ${named} AND revoked = false
    RETURNING id
  `;
  return { userId: named, status: 'frozen', keysRevoked: rows.length };
}

/** Mint refuses a frozen/closed/missing user without rewriting auth-service.ts. */
export function installDisabledMintRefuse(auth: AuthService, sql: Sql): void {
  const orig = auth.createApiKey.bind(auth);
  auth.createApiKey = async (input) => {
    const users = await sql<Array<{ status: string }>>`
      SELECT status FROM users WHERE id = ${input.userId} LIMIT 1
    `;
    const user = users[0];
    if (!user) throw new AuthError('User not found', 'auth.not_found');
    if (user.status !== 'active') throw new AuthError(`Account is ${user.status}`, 'auth.account_frozen');
    return orig(input);
  };
}
