import { describe, expect, it } from 'vitest';
import { issueAccessToken, type TokenConfig } from '@intafaced/auth';
import { EDGE_PRINCIPAL_HEADER } from '@intafaced/contracts';
import { exchangePrincipal } from './principal-exchange.js';

const tokens: TokenConfig = {
  secret: 'edge-test-jwt-signing-secret-32-chars',
  issuer: 'intafaced',
  audience: 'intafaced',
  accessTtlSeconds: 900,
};

const EDGE_SECRET = 'edge-test-principal-secret-32-chars!';
const OWNERSHIP_SECRET = 'edge-test-identity-ownership-secret-32';
const USER = '11111111-1111-4111-8111-111111111111';
const SESSION = '22222222-2222-4222-8222-222222222222';
const VERIFIED_AT = '2026-08-25T00:00:00.000Z';

const options = {
  tokens,
  edgeSecret: EDGE_SECRET,
  region: 'GB',
  identityUrl: 'http://identity.test',
  identityOwnershipSecret: OWNERSHIP_SECRET,
};

async function accessToken(): Promise<string> {
  const issued = await issueAccessToken({ userId: USER, sessionId: SESSION, scopes: ['trade:read'], tier: 'basic', mfa: false }, tokens);
  return issued.token;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function fetchIdentity(account: Record<string, unknown>): typeof fetch {
  return async (input) => {
    const url = String(input);
    if (url.includes('/internal/account/')) {
      return json({ userId: USER, status: 'active', kycTier: 'none', ...account });
    }
    expect(url).toContain(`/internal/sessions/${SESSION}`);
    return json({ id: SESSION, userId: USER, revoked: false });
  };
}

describe('newly enrolled passkey after last-unenroll drops every HTTP session door if none remain', () => {
  it('newly enrolled verified cred keeps every admission on the existing session', async () => {
    const token = await accessToken();
    const fetch = fetchIdentity({
      webauthnCreds: [{ credentialId: 'cred-3', lastVerifiedAt: VERIFIED_AT }],
    });
    const first = await exchangePrincipal({ authorization: `Bearer ${token}` }, { ...options, fetch });
    const second = await exchangePrincipal({ authorization: `Bearer ${token}` }, { ...options, fetch });
    expect(first.rejected).toBeNull();
    expect(first.principal?.userId).toBe(USER);
    expect(first.headers[EDGE_PRINCIPAL_HEADER]).toBeDefined();
    expect(second.rejected).toBeNull();
    expect(second.principal?.userId).toBe(USER);
    expect(second.headers[EDGE_PRINCIPAL_HEADER]).toBeDefined();
  });

  it('every admission stays, then all drop when none remain after last-unenroll', async () => {
    const token = await accessToken();
    const enrolledFetch = fetchIdentity({
      webauthnCreds: [{ credentialId: 'cred-3', lastVerifiedAt: VERIFIED_AT }],
    });
    const keptA = await exchangePrincipal({ authorization: `Bearer ${token}` }, { ...options, fetch: enrolledFetch });
    const keptB = await exchangePrincipal({ authorization: `Bearer ${token}` }, { ...options, fetch: enrolledFetch });
    expect(keptA.rejected).toBeNull();
    expect(keptB.rejected).toBeNull();

    const emptyFetch = fetchIdentity({ webauthnCreds: [] });
    const dropA = await exchangePrincipal({ authorization: `Bearer ${token}` }, { ...options, fetch: emptyFetch });
    const dropB = await exchangePrincipal({ authorization: `Bearer ${token}` }, { ...options, fetch: emptyFetch });
    expect(dropA.rejected).toBe('invalid');
    expect(dropA.principal).toBeNull();
    expect(dropA.headers[EDGE_PRINCIPAL_HEADER]).toBeUndefined();
    expect(dropB.rejected).toBe('invalid');
    expect(dropB.principal).toBeNull();
    expect(dropB.headers[EDGE_PRINCIPAL_HEADER]).toBeUndefined();
  });

  it('newly enrolled cred without lastVerifiedAt drops every admission', async () => {
    const token = await accessToken();
    const fetch = fetchIdentity({ webauthnCreds: [{ credentialId: 'cred-3' }] });
    const deadA = await exchangePrincipal({ authorization: `Bearer ${token}` }, { ...options, fetch });
    const deadB = await exchangePrincipal({ authorization: `Bearer ${token}` }, { ...options, fetch });
    expect(deadA.rejected).toBe('invalid');
    expect(deadA.principal).toBeNull();
    expect(deadA.headers[EDGE_PRINCIPAL_HEADER]).toBeUndefined();
    expect(deadB.rejected).toBe('invalid');
    expect(deadB.principal).toBeNull();
    expect(deadB.headers[EDGE_PRINCIPAL_HEADER]).toBeUndefined();
  });
});
