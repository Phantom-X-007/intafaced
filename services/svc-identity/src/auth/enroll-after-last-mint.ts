/**
 * Mint an API key only after the newly enrolled passkey verifies following a last-unenroll.
 * Refuse if none remain. Reuses requireVerifiedPasskey and mintApiKeyAfterPasskey.
 * No invented challenge.
 */
import type { Sql } from 'postgres';
import type { ApiKeyMinter } from './mint-api-key-ip.js';
import { mintApiKeyAfterPasskey, requireVerifiedPasskey } from './mint-api-key-passkey.js';

export function newlyEnrolledPasskeyMints(raw: unknown): void {
  requireVerifiedPasskey(raw);
}

export async function mintApiKeyAfterNewlyEnrolledPasskey(
  minter: ApiKeyMinter,
  sql: Sql,
  input: {
    userId: string;
    name: string;
    scopes: string[];
    grantorScopes: readonly string[];
    grantorKid?: string | null;
    domainWhitelist?: string[];
    expiresAt?: Date;
    mode?: 'live' | 'sandbox';
  },
): Promise<{ id: string; key: string; prefix: string; mode: 'live' | 'sandbox' }> {
  return mintApiKeyAfterPasskey(minter, sql, input);
}
