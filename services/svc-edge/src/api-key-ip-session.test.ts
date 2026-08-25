import { describe, expect, it } from 'vitest';
import { exchangePrincipal } from './principal-exchange.js';
import type { TokenConfig } from '@intafaced/auth';

const tokens: TokenConfig = {
  secret: 'edge-test-jwt-signing-secret-32-chars',
  issuer: 'intafaced',
  audience: 'intafaced',
  accessTtlSeconds: 900,
};

const options = {
  tokens,
  edgeSecret: 'edge-test-principal-secret-32-chars!',
  region: 'GB',
  identityUrl: 'https://identity.test',
};

describe('API key IP allowlist at the session door', () => {
  it('strips a client-supplied x-forwarded-for / x-real-ip', async () => {
    const result = await exchangePrincipal(
      {
        authorization: 'Bearer ifc_stolen',
        'x-forwarded-for': '198.51.100.9',
        'x-real-ip': '198.51.100.9',
      },
      { ...options, fetch: async () => new Response(null, { status: 401 }) },
    );
    expect(result.headers['x-forwarded-for']).toBeUndefined();
    expect(result.headers['x-real-ip']).toBeUndefined();
    expect(result.rejected).toBe('invalid');
  });

  it('forwards the server-resolved IP to identity exchange, never the client spoof', async () => {
    const seen: { url?: string; headers?: Headers } = {};
    await exchangePrincipal(
      {
        authorization: 'Bearer ifc_live_secret',
        'x-forwarded-for': '198.51.100.9',
        origin: 'https://app.example.com',
      },
      {
        ...options,
        clientIp: '203.0.113.10',
        fetch: async (input, init) => {
          seen.url = String(input);
          seen.headers = new Headers(init?.headers);
          return new Response(null, { status: 401 });
        },
      },
    );
    expect(seen.url).toContain('/trpc/apiKeys.exchange');
    expect(seen.headers?.get('x-forwarded-for')).toBe('203.0.113.10');
    expect(seen.headers?.get('x-real-ip')).toBe('203.0.113.10');
    expect(seen.headers?.get('origin')).toBe('https://app.example.com');
  });

  it('rewrites forwarded IP from options.clientIp and drops a forged hop', async () => {
    const result = await exchangePrincipal(
      { authorization: 'Bearer ifc_live_secret', 'x-forwarded-for': '198.51.100.9' },
      { ...options, clientIp: '203.0.113.10', fetch: async () => new Response(null, { status: 401 }) },
    );
    expect(result.headers['x-forwarded-for']).toBe('203.0.113.10');
    expect(result.headers['x-real-ip']).toBe('203.0.113.10');
  });

  it('refuses an invented CIDR as clientIp', async () => {
    const result = await exchangePrincipal(
      { authorization: 'Bearer ifc_live_secret' },
      { ...options, clientIp: '10.0.0.0/8', fetch: async () => new Response(null, { status: 401 }) },
    );
    expect(result.headers['x-forwarded-for']).toBeUndefined();
  });
});
