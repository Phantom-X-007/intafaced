/**
 * GET /ready must not sell isolate as wired when the lake is missing.
 * Isolate wired is not lake wired. missingLake is named, not silent.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { missingLake } from './backtest/lake.js';
import { QUANT_BACKTEST_LAKE_MISSING, QUANT_SANDBOX_UNWIRED } from './errors.js';
import { quantReadyHonesty } from './ready-honesty.js';

const here = dirname(fileURLToPath(import.meta.url));

describe('quant /ready honesty — isolate wired is not a missing lake', () => {
  const apps: FastifyInstance[] = [];
  afterEach(async () => {
    while (apps.length) {
      const app = apps.pop();
      if (app) await app.close();
    }
  });

  it('does not sell isolate as wired when the lake is missing', () => {
    const lake = missingLake();
    const body = quantReadyHonesty({ isolateWired: true, lakeWired: lake.wired, venueVaultSet: false });
    expect(lake.wired).toBe(false);
    expect(body).toEqual({
      ready: true,
      custodial: false,
      isolate: 'unwired',
      lake: 'missing',
      refuse: QUANT_BACKTEST_LAKE_MISSING,
      venueVault: 'unset',
    });
    expect(body.isolate).not.toBe('wired');
  });

  it('sells isolate as wired only when isolate and lake are both wired', () => {
    const body = quantReadyHonesty({ isolateWired: true, lakeWired: true, venueVaultSet: true });
    expect(body).toEqual({
      ready: true,
      custodial: false,
      isolate: 'wired',
      lake: 'wired',
      refuse: null,
      venueVault: 'trade-only',
    });
  });

  it('names sandbox unwired when the lake is wired and the isolate is not', () => {
    const body = quantReadyHonesty({ isolateWired: false, lakeWired: true, venueVaultSet: false });
    expect(body.isolate).toBe('unwired');
    expect(body.lake).toBe('wired');
    expect(body.refuse).toBe(QUANT_SANDBOX_UNWIRED);
  });

  it('GET /ready as index.ts mounts does not hardcode isolate wired over missingLake', async () => {
    const lake = missingLake();
    const app = Fastify({ logger: false });
    app.get('/ready', async () => quantReadyHonesty({ isolateWired: true, lakeWired: lake.wired, venueVaultSet: false }));
    await app.ready();
    apps.push(app);
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, unknown>;
    expect(body.isolate).toBe('unwired');
    expect(body.lake).toBe('missing');
    expect(body.refuse).toBe(QUANT_BACKTEST_LAKE_MISSING);
    expect(body.ready).toBe(true);
  });

  it('index.ts serves /ready via quantReadyHonesty over missingLake, not a hardcoded isolate wired', () => {
    const indexSrc = readFileSync(join(here, 'index.ts'), 'utf8');
    expect(indexSrc).toContain('quantReadyHonesty');
    expect(indexSrc).toContain('missingLake');
    expect(indexSrc).not.toMatch(/app\.get\('\/ready'[\s\S]{0,400}isolate:\s*'wired'/);
    expect(indexSrc).not.toMatch(/log\.info\(\{[^}]*isolate:\s*'wired'/);
  });
});
