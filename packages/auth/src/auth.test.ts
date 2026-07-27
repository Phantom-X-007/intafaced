import { describe, expect, it } from 'vitest';
import { issueAccessToken, verifyAccessToken, AuthError, generateRefreshToken, hashRefreshToken } from './tokens.js';
import { requireScope, requireTier, requireOwnership, requireMfa, bearerToken } from './guards.js';
import { assertKeyScopesAllowed, expandScopes, hasScope, isScope, SCOPES } from './scopes.js';

const config = {
  secret: 'a-test-signing-secret-that-is-long-enough',
  issuer: 'intafaced',
  audience: 'intafaced.api',
  accessTtlSeconds: 900,
};

const USER = '33333333-3333-4333-8333-333333333333';
const SESSION = '44444444-4444-4444-8444-444444444444';

async function principal(overrides: Partial<Parameters<typeof issueAccessToken>[0]> = {}) {
  const { token } = await issueAccessToken({ userId: USER, sessionId: SESSION, scopes: ['trade:write'], ...overrides }, config);
  return verifyAccessToken(token, config);
}

describe('access tokens', () => {
  it('round-trips claims', async () => {
    const p = await principal({ scopes: ['trade:write', 'pay:read'], tier: 'full', mfa: true });
    expect(p.userId).toBe(USER);
    expect(p.sid).toBe(SESSION);
    expect(p.tier).toBe('full');
    expect(p.mfa).toBe(true);
    expect(p.scopes).toContain('trade:write');
  });

  it('rejects a token signed with a different secret', async () => {
    const { token } = await issueAccessToken({ userId: USER, sessionId: SESSION, scopes: [] }, config);
    await expect(verifyAccessToken(token, { ...config, secret: 'a-completely-different-secret-value!!' })).rejects.toThrow(AuthError);
  });

  it('rejects a token issued for another audience', async () => {
    const { token } = await issueAccessToken({ userId: USER, sessionId: SESSION, scopes: [] }, config);
    await expect(verifyAccessToken(token, { ...config, audience: 'someone.else' })).rejects.toMatchObject({
      code: 'token.invalid',
    });
  });

  it('rejects an expired token', async () => {
    const { token } = await issueAccessToken({ userId: USER, sessionId: SESSION, scopes: [] }, { ...config, accessTtlSeconds: -1 });
    await expect(verifyAccessToken(token, config)).rejects.toMatchObject({ code: 'token.expired' });
  });

  it('rejects a tampered token', async () => {
    const { token } = await issueAccessToken({ userId: USER, sessionId: SESSION, scopes: ['trade:read'] }, config);
    const [header, , signature] = token.split('.');
    const forged = `${header}.${Buffer.from(JSON.stringify({ sub: USER, scopes: ['admin:treasury'] })).toString('base64url')}.${signature}`;
    await expect(verifyAccessToken(forged, config)).rejects.toThrow(AuthError);
  });

  it('refuses a weak signing secret outright', async () => {
    await expect(issueAccessToken({ userId: USER, sessionId: SESSION, scopes: [] }, { ...config, secret: 'tooshort' })).rejects.toThrow(
      AuthError,
    );
  });
});

describe('refresh tokens', () => {
  it('never stores the usable value', () => {
    const { token, hash } = generateRefreshToken();
    expect(hash).not.toContain(token);
    expect(hash).toHaveLength(64);
    expect(hashRefreshToken(token)).toBe(hash);
  });

  it('generates a distinct token every time', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateRefreshToken().token));
    expect(tokens.size).toBe(100);
  });
});

describe('scopes', () => {
  it('recognises only declared scopes', () => {
    expect(isScope('trade:write')).toBe(true);
    expect(isScope('trade:everything')).toBe(false);
  });

  it('has no ledger:write scope — balances never move on a user token', () => {
    expect(SCOPES).not.toContain('ledger:write');
  });

  it('expands only the implications that are written down', () => {
    expect(hasScope(['trade:write'], 'trade:read')).toBe(true);
    expect(hasScope(['trade:read'], 'trade:write')).toBe(false);
    expect(hasScope(['admin:write'], 'admin:read')).toBe(true);
    expect(hasScope(['trade:write'], 'pay:write')).toBe(false);
  });

  it('ignores unknown scopes rather than trusting them', () => {
    expect(expandScopes(['not:a:scope', 'trade:read'])).toEqual(new Set(['trade:read']));
  });

  it('refuses to mint an API key that can withdraw', () => {
    expect(() => assertKeyScopesAllowed(['trade:read', 'trade:withdraw'])).toThrow(/interactive/);
    expect(() => assertKeyScopesAllowed(['trade:read', 'trade:write'])).not.toThrow();
  });
});

describe('guards', () => {
  it('allows a call the principal is scoped for', async () => {
    const p = await principal({ scopes: ['trade:write'] });
    expect(() => requireScope(p, 'trade:write')).not.toThrow();
    expect(() => requireScope(p, 'trade:read')).not.toThrow();
  });

  it('denies a call the principal is not scoped for', async () => {
    const p = await principal({ scopes: ['trade:read'] });
    expect(() => requireScope(p, 'pay:write')).toThrow(AuthError);
  });

  it('demands 2FA for withdrawal even when the scope is present', async () => {
    const withoutMfa = await principal({ scopes: ['trade:withdraw'], mfa: false });
    expect(() => requireScope(withoutMfa, 'trade:withdraw')).toThrow(/two-factor/);

    const withMfa = await principal({ scopes: ['trade:withdraw'], mfa: true });
    expect(() => requireScope(withMfa, 'trade:withdraw')).not.toThrow();
  });

  it('enforces verification tiers', async () => {
    const p = await principal({ tier: 'basic' });
    expect(() => requireTier(p, 'basic')).not.toThrow();
    expect(() => requireTier(p, 'full')).toThrow(AuthError);
  });

  it('refuses to act on another account', async () => {
    const p = await principal();
    expect(() => requireOwnership(p, USER)).not.toThrow();
    expect(() => requireOwnership(p, '55555555-5555-4555-8555-555555555555')).toThrow(AuthError);
  });

  it('requires MFA explicitly', async () => {
    const p = await principal({ mfa: false });
    expect(() => requireMfa(p)).toThrow(AuthError);
  });
});

describe('bearerToken', () => {
  it('parses a header', () => {
    expect(bearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
    expect(bearerToken('bearer abc')).toBe('abc');
  });

  it('returns null for anything else', () => {
    expect(bearerToken(undefined)).toBeNull();
    expect(bearerToken('')).toBeNull();
    expect(bearerToken('Basic abc')).toBeNull();
  });
});
