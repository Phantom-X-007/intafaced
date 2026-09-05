/**
 * GET /ready must not sell IDENTITY_URL / SUPPORT_URL as live peers.
 * A set URL is config. This process does not fetch on /ready.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { OPS_IDENTITY_UNWIRED, OPS_SUPPORT_UNWIRED } from './codes.js';
import { OPS_IDENTITY_UNPROBED, OPS_SUPPORT_UNPROBED, identityUrlHonesty, opsReadyUrlHonesty, supportUrlHonesty } from './ready-honesty.js';

const here = dirname(fileURLToPath(import.meta.url));

describe('ops ready honesty — URL-set is not live', () => {
  const apps: FastifyInstance[] = [];
  afterEach(async () => {
    while (apps.length) {
      const app = apps.pop();
      if (app) await app.close();
    }
  });

  it('blank URLs are absent + unwired, never ok or live', () => {
    expect(opsReadyUrlHonesty({})).toEqual({
      identityUrlConfigured: false,
      supportUrlConfigured: false,
      identity: { status: 'absent', code: OPS_IDENTITY_UNWIRED },
      support: { status: 'absent', code: OPS_SUPPORT_UNWIRED },
    });
    expect(identityUrlHonesty('  ').status).not.toBe('ok');
    expect(supportUrlHonesty(undefined).status).not.toBe('ok');
  });

  it('set URLs are configured + unprobed, never live', () => {
    const body = opsReadyUrlHonesty({
      IDENTITY_URL: 'http://identity.test',
      SUPPORT_URL: 'http://support.test',
    });
    expect(body).toEqual({
      identityUrlConfigured: true,
      supportUrlConfigured: true,
      identity: { status: 'configured', code: OPS_IDENTITY_UNPROBED },
      support: { status: 'configured', code: OPS_SUPPORT_UNPROBED },
    });
    expect(JSON.stringify(body)).not.toMatch(/"ok"/);
    expect(JSON.stringify(body)).not.toMatch(/live/i);
  });

  it('GET /ready as index.ts mounts does not emit identityUrl/supportUrl booleans', async () => {
    const app = Fastify({ logger: false });
    app.get('/ready', async () => ({
      ready: true as const,
      custodial: false as const,
      ...opsReadyUrlHonesty({ IDENTITY_URL: 'http://identity.test' }),
    }));
    await app.ready();
    apps.push(app);
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, unknown>;
    expect(body.ready).toBe(true);
    expect(body).not.toHaveProperty('identityUrl');
    expect(body).not.toHaveProperty('supportUrl');
    expect(body.identityUrlConfigured).toBe(true);
    expect(body.supportUrlConfigured).toBe(false);
    expect(body.identity).toEqual({ status: 'configured', code: OPS_IDENTITY_UNPROBED });
    expect(body.support).toEqual({ status: 'absent', code: OPS_SUPPORT_UNWIRED });
    expect(JSON.stringify(body)).not.toMatch(/identity\.test/);
  });

  it('index.ts serves opsReadyUrlHonesty, not Boolean(env.IDENTITY_URL)', () => {
    const indexSrc = readFileSync(join(here, 'index.ts'), 'utf8');
    expect(indexSrc).toContain('opsReadyUrlHonesty');
    expect(indexSrc).toContain('...opsReadyUrlHonesty(env)');
    expect(indexSrc).not.toMatch(/identityUrl:\s*Boolean\(env\.IDENTITY_URL\)/);
    expect(indexSrc).not.toMatch(/supportUrl:\s*Boolean\(env\.SUPPORT_URL\)/);
    expect(indexSrc).not.toMatch(/fetch\(/);
  });
});
