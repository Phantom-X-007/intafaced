import { describe, expect, it } from 'vitest';
import { issueAccessToken, verifyAccessToken } from './tokens.js';

const config = {
  secret: 'a-test-signing-secret-that-is-long-enough',
  issuer: 'intafaced',
  audience: 'intafaced.api',
  accessTtlSeconds: 900,
};

const USER = '33333333-3333-4333-8333-333333333333';
const SESSION = '44444444-4444-4444-8444-444444444444';
const API_KEY = '55555555-5555-4555-8555-555555555555';

function decodePayload(token: string): Record<string, unknown> {
  const payload = token.split('.')[1];
  if (payload === undefined) throw new Error('JWT missing payload segment');
  return JSON.parse(Buffer.from(payload, 'base64url').toString()) as Record<string, unknown>;
}

describe('key_env on access tokens', () => {
  it('omitted key_env is undefined, never sandbox', async () => {
    const { token } = await issueAccessToken({ userId: USER, sessionId: SESSION, scopes: ['trade:write'] }, config);
    const principal = await verifyAccessToken(token, config);
    const raw = decodePayload(token);

    expect(principal.key_env).toBeUndefined();
    expect(principal.key_env).not.toBe('sandbox');
    expect(Object.prototype.hasOwnProperty.call(raw, 'key_env')).toBe(false);
    expect(raw.key_env).not.toBe('sandbox');
  });

  it('explicit live stays live; explicit sandbox stays sandbox', async () => {
    const live = await issueAccessToken(
      {
        userId: USER,
        sessionId: SESSION,
        scopes: ['trade:read'],
        apiKeyId: API_KEY,
        keyEnv: 'live',
      },
      config,
    );
    const sandbox = await issueAccessToken(
      {
        userId: USER,
        sessionId: SESSION,
        scopes: ['trade:read'],
        apiKeyId: API_KEY,
        keyEnv: 'sandbox',
      },
      config,
    );

    expect((await verifyAccessToken(live.token, config)).key_env).toBe('live');
    expect((await verifyAccessToken(sandbox.token, config)).key_env).toBe('sandbox');
  });
});
