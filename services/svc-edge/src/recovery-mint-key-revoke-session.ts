/**
 * Refuse the revoked recovered-session API key at the HTTP session door.
 * Refuse if the key is still live. Reuses assertIdentityApiKeyLive.
 * Not a redo of recovery-drop-other-admissions or recovered-mint-key-revoke-stream.
 */
import { ApiKeyRevokedError, assertIdentityApiKeyLive, type LoadApiKeyOwnershipOptions } from './api-key-revoked.js';

export class RecoveredMintKeySessionError extends Error {
  constructor(
    message: string,
    readonly code: 'auth.api_key_live',
  ) {
    super(message);
    this.name = 'RecoveredMintKeySessionError';
  }
}

export async function recoveredMintKeyRevokeRefusesSession(options: LoadApiKeyOwnershipOptions): Promise<void> {
  try {
    await assertIdentityApiKeyLive(options);
  } catch (err) {
    if (err instanceof ApiKeyRevokedError && err.code === 'auth.api_key_revoked') {
      return;
    }
    throw err;
  }
  throw new RecoveredMintKeySessionError('API key is still live', 'auth.api_key_live');
}
