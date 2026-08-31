import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { LiveCredentialPort, OwnershipSnapshot } from '../private/live-credential.js';
import { recoveredMintKeyRevokeDropsDropCopyStream } from './recovery-mint-key-revoke-stream.js';

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SESSION = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const KEY = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function port(key: OwnershipSnapshot | null | 'live' = 'live'): LiveCredentialPort {
  return {
    async getSession() {
      return { id: SESSION, userId: USER, revoked: false };
    },
    async getApiKey() {
      if (key === 'live') return { id: KEY, userId: USER, revoked: false };
      return key;
    },
  };
}

const input = { userId: USER, sessionId: SESSION, apiKeyId: KEY };

describe('recoveredMintKeyRevokeDropsDropCopyStream', () => {
  it('refuses while the recovered-session key is still live', async () => {
    await expect(recoveredMintKeyRevokeDropsDropCopyStream(port(), input)).rejects.toMatchObject({
      code: 'auth.api_key_live',
    });
  });

  it('allows the drop after that key is revoked', async () => {
    const revoked = port({ id: KEY, userId: USER, revoked: true });
    await expect(recoveredMintKeyRevokeDropsDropCopyStream(revoked, input)).resolves.toBeUndefined();
  });

  it('refuses a missing key', async () => {
    await expect(recoveredMintKeyRevokeDropsDropCopyStream(port(null), input)).rejects.toMatchObject({
      code: 'auth.api_key_denied',
    });
  });

  it('refuses a missing apiKeyId without inventing a session check', async () => {
    await expect(recoveredMintKeyRevokeDropsDropCopyStream(port(), { userId: USER, sessionId: SESSION })).rejects.toMatchObject({
      code: 'auth.api_key_denied',
    });
  });

  it('source reuses assertLiveCredential; not a private-stream or drop-copy-open redo', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, 'recovery-mint-key-revoke-stream.ts'), 'utf8');
    expect(src).toMatch(/recoveredMintKeyRevokeDropsDropCopyStream/);
    expect(src).toMatch(/assertLiveCredential/);
    expect(src).toMatch(/auth.api_key_revoked/);
    expect(src).toMatch(/auth.api_key_live/);
    expect(src).not.toMatch(/PRIVATE_STREAM_PATH/);
    expect(src).not.toMatch(/recoveryCodeOpensRecoveredDropCopyStream/);
    expect(src).not.toMatch(/recoveryCodeDropsOtherStreams/);
    expect(src).not.toMatch(/revokeAllApiKeys/);
    expect(src).not.toMatch(/generateAuthenticationOptions/);
    expect(src).not.toMatch(/INSERT\s+sessions/i);
  });
});
