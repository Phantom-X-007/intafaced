import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { resolve, UPSTREAMS } from './routes.js';

describe('route resolution', () => {
  it('maps a prefix to its upstream and strips the prefix from the path', () => {
    const r = resolve('/api/trade/trpc/orders.create');
    expect(r?.upstream.prefix).toBe('/api/trade');
    expect(r?.path).toBe('/trpc/orders.create');
  });

  /**
   * Merchant public REST lives at edge `/api/pay/v1/*`. The pay upstream has
   * NO preservePath, so the edge strips `/api/pay` and svc-pay must mount at
   * `/v1/*` — not `/api/pay/v1/*`. If this ever flips to preservePath, trpc and
   * webhooks break the other way. Contract enforced both sides: see
   * `services/svc-pay/src/public-rest.ts` `BASE = '/v1'`.
   */
  it('strips /api/pay so merchant REST lands on /v1/* (svc-pay BASE contract)', () => {
    const pay = UPSTREAMS.find((u) => u.prefix === '/api/pay');
    expect(pay, 'pay upstream must exist').toBeDefined();
    expect(pay?.preservePath, 'pay must strip prefix — preservePath breaks trpc/webhooks').toBeFalsy();

    const rest = resolve('/api/pay/v1/payments');
    expect(rest?.upstream.prefix).toBe('/api/pay');
    expect(rest?.path).toBe('/v1/payments');

    const openapi = resolve('/api/pay/v1/openapi.json');
    expect(openapi?.path).toBe('/v1/openapi.json');

    // Sibling mounts still strip correctly — the BASE fix must not tempt preservePath.
    expect(resolve('/api/pay/trpc/payment.create')?.path).toBe('/trpc/payment.create');
    expect(resolve('/api/pay/webhooks/crypto')?.path).toBe('/webhooks/crypto');
    expect(resolve('/api/pay/checkout')?.path).toBe('/checkout');
  });

  it('resolves a bare prefix to the upstream root', () => {
    expect(resolve('/api/identity')?.path).toBe('/');
  });

  it('preserves the full path for public CCXT REST (/api/v1 → trade)', () => {
    const markets = resolve('/api/v1/markets');
    expect(markets?.upstream.prefix).toBe('/api/v1');
    expect(markets?.upstream.envVar).toBe('TRADE_URL');
    expect(markets?.upstream.preservePath).toBe(true);
    expect(markets?.path).toBe('/api/v1/markets');

    const book = resolve('/api/v1/orderbook/BTC%2FUSDT');
    expect(book?.path).toBe('/api/v1/orderbook/BTC%2FUSDT');
  });

  it('does not let /api/v1 steal /api/trade (longer prefix wins)', () => {
    const r = resolve('/api/trade/trpc/markets.list');
    expect(r?.upstream.prefix).toBe('/api/trade');
    expect(r?.path).toBe('/trpc/markets.list');
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

/**
 * README route table drift was the residual that made the wall look incomplete:
 * code forwarded /api/v1, dex, indexer, market, … while the doc listed nine rows.
 * Pin the prefixes into the README so the next table edit fails the suite.
 */
describe('README route table stays honest with UPSTREAMS', () => {
  it('lists every prefix the edge actually forwards', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const readme = readFileSync(join(here, '..', 'README.md'), 'utf8');
    for (const u of UPSTREAMS) {
      expect(readme, u.prefix).toContain(`| \`${u.prefix}\``);
    }
  });
});
