/**
 * Drop the drop-copy stream when an API key minted from the recovered session is revoked.
 * Refuse if the key is still live. Reuses assertLiveCredential.
 * Not a redo of recovery-mint-key-revoke-stream (private /private/stream)
 * or recovery-open-recovered-stream (drop-copy open).
 */
import {
  assertLiveCredential,
  LiveCredentialError,
  type LiveCredentialInput,
  type LiveCredentialPort,
} from '../private/live-credential.js';

export class RecoveredMintKeyDropCopyStreamError extends Error {
  constructor(
    message: string,
    readonly code: 'auth.api_key_live',
  ) {
    super(message);
    this.name = 'RecoveredMintKeyDropCopyStreamError';
  }
}

export async function recoveredMintKeyRevokeDropsDropCopyStream(port: LiveCredentialPort, input: LiveCredentialInput): Promise<void> {
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
  throw new RecoveredMintKeyDropCopyStreamError('API key is still live', 'auth.api_key_live');
}
