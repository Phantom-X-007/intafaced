/**
 * Rotate an API key. The old key is revoked (cannot place).
 * The new key is minted by AuthService — no invented secret.
 * Same name, scopes, mode, domain list, expiry, IP allowlist, account bind.
 */
import type { Sql } from 'postgres';
import { bindApiKeyAccount } from './bind-api-key-account.js';
import { bindApiKeyIpAllowlist } from './auth-service-ip.js';
import type { ApiKeyMinter } from './mint-api-key-ip.js';

export class RotateApiKeyError extends Error {
  constructor(
    message: string,
    readonly code: 'auth.not_found',
  ) {
    super(message);
    this.name = 'RotateApiKeyError';
  }
}

export async function rotateApiKey(
  minter: ApiKeyMinter,
  sql: Sql,
  input: { userId: string; keyId: string; grantorScopes: readonly string[] },
): Promise<{ id: string; key: string; prefix: string; mode: 'live' | 'sandbox'; revokedKeyId: string }> {
  const rows = await sql<
    Array<{
      id: string;
      name: string;
      scopes: string[];
      domain_whitelist: string[] | null;
      expires_at: Date | null;
      mode: string | null;
      ip_allowlist: string[] | null;
      account_id: string | null;
    }>
  >`
    SELECT id, name, scopes, domain_whitelist, expires_at, mode, ip_allowlist, account_id
    FROM api_keys
    WHERE id = ${input.keyId} AND user_id = ${input.userId} AND revoked = false
  `;
  const old = rows[0];
  if (!old) throw new RotateApiKeyError('API key not found', 'auth.not_found');

  const minted = await minter.createApiKey({
    userId: input.userId,
    name: old.name,
    scopes: old.scopes,
    grantorScopes: input.grantorScopes,
    domainWhitelist: old.domain_whitelist ?? [],
    expiresAt: old.expires_at ?? undefined,
    mode: old.mode === 'sandbox' ? 'sandbox' : 'live',
  });

  try {
    if (old.account_id) {
      await bindApiKeyAccount(sql, input.userId, minted.id, old.account_id);
    }
    const ips = old.ip_allowlist ?? [];
    if (ips.length > 0) {
      await bindApiKeyIpAllowlist(sql, input.userId, minted.id, ips);
    }
    const revoked = await minter.revokeApiKey(input.userId, old.id);
    if (!revoked) throw new RotateApiKeyError('API key not found', 'auth.not_found');
    return { ...minted, revokedKeyId: old.id };
  } catch (err) {
    await minter.revokeApiKey(input.userId, minted.id);
    throw err;
  }
}
