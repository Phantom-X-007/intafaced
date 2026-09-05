/**
 * GET /ready must not sell a nonempty upstream env URL as a wired hop.
 * A set URL is config. This process does not fetch on /ready.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { EDGE_UPSTREAM_UNPROBED, readyUpstreamHonesty } from './ready-honesty.js';

const here = dirname(fileURLToPath(import.meta.url));

describe('edge ready honesty — URL-set is not wired', () => {
  const apps: FastifyInstance[] = [];
  afterEach(async () => {
    while (apps.length) {
      const app = apps.pop();
      if (app) await app.close();
    }
  });

  it('blank URLs are absent + unprobed, never wired', () => {
    const body = readyUpstreamHonesty(() => undefined);
    expect(body.configured).toEqual([]);
    expect(body.absent.length).toBeGreaterThan(0);
    expect(body.absent).toContain('/api/pay');
    expect(body.probe).toBe('unprobed');
    expect(body.code).toBe(EDGE_UPSTREAM_UNPROBED);
    expect(JSON.stringify(body)).not.toMatch(/wired/i);
  });

  it('set URLs are configured + unprobed, never wired or live', () => {
    const body = readyUpstreamHonesty((name) => (name === 'PAY_URL' || name === 'IDENTITY_URL' ? 'http://secret.internal' : undefined));
    expect(body.configured).toEqual(expect.arrayContaining(['/api/pay', '/api/identity']));
    expect(body.configured).not.toContain('/api/academy');
    expect(body.absent).toEqual(expect.arrayContaining(['/api/academy', '/api/support']));
    expect(body.probe).toBe('unprobed');
    expect(body.code).toBe(EDGE_UPSTREAM_UNPROBED);
    expect(JSON.stringify(body)).not.toMatch(/wired|live/i);
    expect(JSON.stringify(body)).not.toContain('secret.internal');
  });

  it('GET /ready as index.ts mounts does not emit wired/unwired lists', async () => {
    const app = Fastify({ logger: false });
    app.get('/ready', async () => ({
      ready: true as const,
      upstreamConfiguration: readyUpstreamHonesty((name) => (name === 'PAY_URL' ? 'http://pay.internal' : undefined)),
    }));
    await app.ready();
    apps.push(app);
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, unknown>;
    expect(body.ready).toBe(true);
    expect(body).not.toHaveProperty('upstreamWiring');
    expect(body).not.toHaveProperty('wired');
    const cfg = body.upstreamConfiguration as {
      configured: string[];
      absent: string[];
      probe: string;
      code: string;
    };
    expect(cfg.configured).toContain('/api/pay');
    expect(cfg.absent).toContain('/api/identity');
    expect(cfg.probe).toBe('unprobed');
    expect(cfg.code).toBe(EDGE_UPSTREAM_UNPROBED);
    expect(JSON.stringify(body)).not.toMatch(/"wired"|"unwired"/);
    expect(JSON.stringify(body)).not.toContain('pay.internal');
  });

  it('index.ts serves readyUpstreamHonesty, not wired: isUpstreamWired', () => {
    const indexSrc = readFileSync(join(here, 'index.ts'), 'utf8');
    expect(indexSrc).toContain('readyUpstreamHonesty');
    expect(indexSrc).toContain('upstreamConfiguration: readyUpstreamHonesty(envLookup)');
    expect(indexSrc).not.toMatch(/upstreamWiring/);
    expect(indexSrc).not.toMatch(/wired:\s*table/);
    expect(indexSrc).not.toMatch(/isUpstreamWired/);
    const readyHandler = indexSrc.slice(indexSrc.indexOf("app.get('/ready'"), indexSrc.indexOf('registerKillSwitchGuard'));
    expect(readyHandler).not.toMatch(/\bfetch\s*\(/);
  });
});
