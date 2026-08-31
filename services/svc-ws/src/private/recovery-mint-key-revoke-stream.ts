/**
 * Drop the private stream when an API key minted from the recovered session is revoked.
 * Refuse if the key is still live. Reuses assertLiveCredential.
 * Not a redo of recovery-drop-other-streams.
 */
import { assertLiveCredential, LiveCredentialError, type LiveCredentialInput, type LiveCredentialPort } from './live-credential.js';

export class RecoveredMintKeyStreamError extends Error {
  constructor(
    message: string,
    readonly code: 'auth.api_key_live',
  ) {
    super(message);
    this.name = 'RecoveredMintKeyStreamError';
  }
}

export async function recoveredMintKeyRevokeDropsStream(port: LiveCredentialPort, input: LiveCredentialInput): Promise<void> {
  const id = typeof input.apiKeyId === 'string' ? input.apiKeyId.trim() : '';
  if (!id) {
    throw new LiveCredentialError('API key not found', 'auth.api_key_denied');
  }
  try {
    await assertLiveCredential(port, { ...input, apiKeyId: id });
  } catch (err) {
    if (err instanceof LiveCredentialError && err.code === 'auth.api_key_revoked') {
      return;
    }
    throw err;
  }
  throw new RecoveredMintKeyStreamError('API key is still live', 'auth.api_key_live');
}
