/**
 * Bind / refuse an API key to one owned live sub-account.
 * Exchange wrap: a bound key cannot mint a JWT unless the presented account matches.
 * Unbound (null) keys stay on the legacy exchange path.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Sql } from 'postgres';
import { AuthError, type AuthService } from './auth-service.js';
import { apiKeyAccountAllowed, ApiKeyAccountError, requireAccountId } from './api-key-account.js';
import { hashToken } from './passwords.js';

export const requestAccountAls = new AsyncLocalStorage<string | undefined>();

export async function bindApiKeyAccount(
  sql: Sql,
  userId: string,
  keyId: string,
  accountId: string | null | undefined,
): Promise<{ id: string; accountId: string }> {
  const id = requireAccountId(accountId);
  const owned = await sql<Array<{ id: string; parent_user_id: string; revoked: boolean }>>`
    SELECT id, parent_user_id, revoked FROM sub_accounts WHERE id = ${id} LIMIT 1
  `;
  const acc = owned[0];
  if (!acc || acc.parent_user_id !== userId) {
    throw new ApiKeyAccountError('Account not found or not owned by caller', 'auth.account_denied');
  }
  if (acc.revoked) {
    throw new ApiKeyAccountError('Account is revoked', 'auth.account_revoked');
  }
  const rows = await sql<Array<{ id: string; account_id: string | null }>>`
    UPDATE api_keys
    SET account_id = ${id}
    WHERE id = ${keyId} AND user_id = ${userId} AND revoked = false
    RETURNING id, account_id
  `;
  const row = rows[0];
  if (!row?.account_id) throw new ApiKeyAccountError('API key not found', 'auth.not_found');
  return { id: row.id, accountId: row.account_id };
}

export async function assertApiKeyAccount(
  sql: Sql,
  userId: string,
  keyId: string,
  accountId: string | null | undefined,
): Promise<{ id: string; accountId: string }> {
  const presented = requireAccountId(accountId);
  const id = typeof keyId === 'string' ? keyId.trim() : '';
  if (!id) throw new ApiKeyAccountError('API key not found', 'auth.not_found');
  const rows = await sql<Array<{ id: string; account_id: string | null; revoked: boolean }>>`
    SELECT id, account_id, revoked FROM api_keys
    WHERE id = ${id} AND user_id = ${userId}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row || row.revoked) throw new ApiKeyAccountError('API key not found', 'auth.not_found');
  if (!apiKeyAccountAllowed(row.account_id, presented)) {
    throw new ApiKeyAccountError('API key is not bound to this account', 'auth.account_mismatch');
  }
  return { id: row.id, accountId: presented };
}

/** Wrap exchange so a bound key cannot mint a JWT for a foreign / missing account. */
export function installApiKeyAccountExchange(auth: AuthService, sql: Sql): void {
  const orig = auth.exchangeApiKey.bind(auth);
  auth.exchangeApiKey = async (key: string, requestOrigin?: string | null) => {
    const rows = await sql<Array<{ account_id: string | null }>>`
      SELECT account_id FROM api_keys
      WHERE key_hash = ${hashToken(key)} AND revoked = false
    `;
    const row = rows[0];
    if (row?.account_id && !apiKeyAccountAllowed(row.account_id, requestAccountAls.getStore())) {
      throw new AuthError('Invalid credentials', 'auth.invalid_credentials');
    }
    return orig(key, requestOrigin);
  };
}
