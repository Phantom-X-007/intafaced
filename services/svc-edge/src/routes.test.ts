import { describe, expect, it } from 'vitest';
import { resolve, UPSTREAMS } from './routes.js';

describe('route resolution', () => {
  it('maps a prefix to its upstream and strips the prefix from the path', () => {
    const r = resolve('/api/trade/trpc/orders.create');
    expect(r?.upstream.prefix).toBe('/api/trade');
    expect(r?.path).toBe('/trpc/orders.create');
  });

  it('resolves a bare prefix to the upstream root', () => {
    expect(resolve('/api/identity')?.path).toBe('/');
  });

  /**
   * The property that keeps the edge from being a proxy for the whole internal
   * network. Anything unlisted must 404 — never fall through to a default.
   */
  it('refuses an unknown prefix', () => {
    for (const path of ['/api/ledger/trpc/post', '/api/matching/markets', '/api/unknown', '/internal/jobs/x', '/']) {
      expect(resolve(path), path).toBeNull();
    }
  });

  it('does not route to svc-ledger or svc-matching at all', () => {
    // Both serve service-to-service HTTP behind a shared secret (#50, #55).
    // No browser has business reaching either — `ledger.post` moves value on a
    // module's own authority, which is why no user token carries `ledger:write`.
    const prefixes = UPSTREAMS.map((u) => u.prefix);
    expect(prefixes).not.toContain('/api/ledger');
    expect(prefixes).not.toContain('/api/matching');
  });

  it('matches on a segment boundary, so one prefix cannot swallow another', () => {
    // `/api/identity-admin` must not be captured by `/api/identity` if such a
    // route is ever added. Longest-prefix-wins plus a boundary check.
    expect(resolve('/api/identityadmin/x')).toBeNull();
    expect(resolve('/api/identity-admin/x')).toBeNull();
  });

  it('declares no duplicate prefixes', () => {
    const prefixes = UPSTREAMS.map((u) => u.prefix);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });

  it('gives every upstream an env var so nothing is hardcoded per environment', () => {
    for (const u of UPSTREAMS) {
      expect(u.envVar, u.prefix).toMatch(/^[A-Z0-9_]+_URL$/);
      expect(u.devUrl).toMatch(/^http:\/\/localhost:\d+$/);
    }
  });
});
