/**
 * GET /health and tRPC health must not sell Anvil 31337 as the chain.
 * chainStatus is the probe. Configured / unprobed is not chain ok.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { PROTOCOL_CHAIN_UNPROBED, protocolHealthHonesty } from './health-honesty.js';

const here = dirname(fileURLToPath(import.meta.url));

describe('protocol health honesty — unprobed is not a live chain', () => {
  const apps: FastifyInstance[] = [];
  afterEach(async () => {
    while (apps.length) {
      const app = apps.pop();
      if (app) await app.close();
    }
  });

  it('payload has no chainId, observedChainId null, status unprobed', () => {
    const body = protocolHealthHonesty({
      relayEnabled: true,
      factoryConfigured: false,
      venueVaultConfigured: false,
    });
    expect(body).toEqual({
      ok: true,
      service: 'svc-protocol',
      custodial: false,
      relayEnabled: true,
      factoryConfigured: false,
      venueVaultConfigured: false,
      chain: { status: 'unprobed', code: PROTOCOL_CHAIN_UNPROBED, observedChainId: null },
    });
    expect(body).not.toHaveProperty('chainId');
    expect(JSON.stringify(body)).not.toMatch(/31337/);
  });

  it('GET /health as index.ts mounts does not echo 31337', async () => {
    const app = Fastify({ logger: false });
    app.get('/health', async () =>
      protocolHealthHonesty({
        relayEnabled: true,
        factoryConfigured: false,
        venueVaultConfigured: false,
      }),
    );
    await app.ready();
    apps.push(app);
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.chainId).toBeUndefined();
    expect(body.chain).toEqual({
      status: 'unprobed',
      code: PROTOCOL_CHAIN_UNPROBED,
      observedChainId: null,
    });
    expect(JSON.stringify(body)).not.toMatch(/31337/);
  });

  it('index.ts and router.ts serve health via protocolHealthHonesty, not PROTOCOL_CHAIN_ID', () => {
    const indexSrc = readFileSync(join(here, 'index.ts'), 'utf8');
    const routerSrc = readFileSync(join(here, 'router.ts'), 'utf8');
    expect(indexSrc).toContain('protocolHealthHonesty');
    expect(routerSrc).toContain('protocolHealthHonesty');
    expect(indexSrc).not.toMatch(/app\.get\('\/health'[\s\S]{0,400}chainId:\s*env\.PROTOCOL_CHAIN_ID/);
    expect(routerSrc).not.toMatch(/health:[\s\S]{0,500}chainId:\s*chain\.config\.chainId/);
  });
});
