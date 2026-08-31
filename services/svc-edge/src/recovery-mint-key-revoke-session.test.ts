import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { recoveredMintKeyRevokeRefusesSession } from './recovery-mint-key-revoke-session.js';

const USER = '11111111-1111-4111-8111-111111111111';
const KEY = '33333333-3333-4333-8333-333333333333';
const SECRET = 'edge-test-identity-ownership-secret-32';

const base = {
  identityUrl: 'http://identity.test',
  apiKeyId: KEY,
  userId: USER,
  identityOwnershipSecret: SECRET,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('recoveredMintKeyRevokeRefusesSession', () => {
  it('refuses while the recovered-session key is still live', async () => {
    await expect(
      recoveredMintKeyRevokeRefusesSession({
        ...base,
        fetch: async () => json({ id: KEY, userId: USER, revoked: false }),
      }),
    ).rejects.toMatchObject({ code: 'auth.api_key_live' });
  });

  it('allows the HTTP refuse after that key is revoked', async () => {
    await expect(
      recoveredMintKeyRevokeRefusesSession({
        ...base,
        fetch: async () => json({ id: KEY, userId: USER, revoked: true }),
      }),
    ).resolves.toBeUndefined();
  });

  it('refuses a missing key', async () => {
    await expect(
      recoveredMintKeyRevokeRefusesSession({
        ...base,
        fetch: async () => new Response(null, { status: 404 }),
      }),
    ).rejects.toMatchObject({ code: 'auth.api_key_denied' });
  });

  it('refuses a missing apiKeyId without inventing a session check', async () => {
    await expect(
      recoveredMintKeyRevokeRefusesSession({
        ...base,
        apiKeyId: '',
        fetch: async () => {
          throw new Error('should not fetch');
        },
      }),
    ).rejects.toMatchObject({ code: 'auth.api_key_denied' });
  });

  it('source reuses assertIdentityApiKeyLive; not a drop-other or stream redo', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, 'recovery-mint-key-revoke-session.ts'), 'utf8');
    expect(src).toMatch(/assertIdentityApiKeyLive/);
    expect(src).toMatch(/auth.api_key_revoked/);
    expect(src).toMatch(/auth.api_key_live/);
    expect(src).not.toMatch(/recoveryCodeDropsOtherAdmissions/);
    expect(src).not.toMatch(/recoveredMintKeyRevokeDropsStream/);
    expect(src).not.toMatch(/revokeAllApiKeys/);
    expect(src).not.toMatch(/generateAuthenticationOptions/);
    expect(src).not.toMatch(/INSERT\s+sessions/i);
  });
});
